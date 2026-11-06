import type {
  CanonicalBBox,
  CanonicalDocument,
  CanonicalPage,
  CanonicalWord,
} from "../domain/canonicalDocument.types.js";
import type {
  FieldCandidate,
  FieldCandidateEnvelope,
} from "../domain/fieldCandidate.types.js";
import { hsLikeDigits } from "./invoiceHsCandidateDiscovery.js";

const EXTRACTOR = "invoice-product-code-generic-v1";
const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;

function norm(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}
function cy(box: CanonicalBBox): number { return (box.y0 + box.y1) / 2; }
function cx(box: CanonicalBBox): number { return (box.x0 + box.x1) / 2; }

function firstCandidate(fields: FieldCandidateEnvelope["fields"], field: string): FieldCandidate | undefined {
  const values = fields[field] ?? [];
  return values.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
}

function goodsRowIndexes(fields: FieldCandidateEnvelope["fields"]): number[] {
  return [...new Set(
    Object.keys(fields)
      .map((field) => ROW_FIELD_RE.exec(field)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
  )].sort((a, b) => a - b);
}

function compactSku(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return undefined;
  if (/\s{2,}/.test(trimmed)) return undefined;
  const compact = norm(trimmed).replace(/[^A-Z0-9._/-]/g, "");
  if (compact.length < 3 || compact.length > 32) return undefined;
  // Prefer alphanumeric SKUs; allow pure numeric only when not HS-length tariff.
  if (/^\d+$/.test(compact)) {
    if (hsLikeDigits(compact)) return undefined;
    if (compact.length < 4 || compact.length > 14) return undefined;
  }
  if (!/[A-Z0-9]/.test(compact)) return undefined;
  return trimmed.replace(/\s+/g, " ").trim();
}

function isProductCodeHeader(text: string): boolean {
  const n = norm(text).replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (/\b(?:HSN?|GTIP|TARIFF|CUSTOMS|GUMRUK)\b/.test(n)) return false;
  if (/^(?:SKU|ARTICLE|ARTIKEL|KOD|KODU)$/.test(n)) return true;
  if (/^(?:PRODUCT|ITEM|MATERIAL|MALZEME)\s+(?:CODE|KOD|KODU|NO|NR)$/.test(n)) return true;
  if (/^(?:ART\.?\s*NR|ARTNR|ITEM\s*NO|MAT\.?\s*NO)$/.test(n)) return true;
  // Bare CODE only when not "HS CODE" style (already rejected above).
  if (n === "CODE") return true;
  return false;
}

function nearTariffHeader(page: CanonicalPage, header: CanonicalWord): boolean {
  for (const word of page.words) {
    if (Math.abs(cy(word.bbox) - cy(header.bbox)) > 0.025) continue;
    if (Math.abs(cx(word.bbox) - cx(header.bbox)) > 0.12) continue;
    if (/\b(?:HSN?|GTIP|TARIFF|CUSTOMS)\b/i.test(word.text)) return true;
  }
  return false;
}

function primaryCodeToken(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const tokens = value.trim().split(/\s+/);
  for (const token of tokens) {
    const compact = norm(token).replace(/[^A-Z0-9]/g, "");
    if (compact.length >= 5 && /\d/.test(compact)) return compact;
    if (compact.length >= 6) return compact;
  }
  const first = norm(tokens[0] ?? "").replace(/[^A-Z0-9]/g, "");
  return first.length >= 4 ? first : undefined;
}

function locateTextAnchor(
  canonical: CanonicalDocument,
  preferredPage: number | undefined,
  hsValue: unknown,
  descriptionValue: unknown,
  quantityValue: unknown,
): { page: CanonicalPage; word: CanonicalWord } | undefined {
  const needles: string[] = [];
  const hs = primaryCodeToken(hsValue) ?? (typeof hsValue === "string" ? hsValue.replace(/[^\d]/g, "") : "");
  if (hs && hs.length >= 6) needles.push(hs);
  if (typeof descriptionValue === "string") {
    for (const token of descriptionValue.trim().split(/\s+/)) {
      const compact = norm(token).replace(/[^A-Z0-9]/g, "");
      if (compact.length >= 5 && !/^\d+$/.test(compact)) needles.push(compact);
    }
  }
  if (typeof quantityValue === "number" && Number.isFinite(quantityValue)) {
    needles.push(String(quantityValue));
  }
  if (!needles.length) return undefined;

  const pages = preferredPage != null
    ? [
      ...canonical.pages.filter((page) => page.pageNumber === preferredPage),
      ...canonical.pages.filter((page) => page.pageNumber !== preferredPage),
    ]
    : canonical.pages;

  let best: { page: CanonicalPage; word: CanonicalWord; score: number } | undefined;
  for (const page of pages) {
    for (const word of page.words) {
      const token = primaryCodeToken(word.text) ?? norm(word.text).replace(/[^A-Z0-9]/g, "");
      if (!token) continue;
      for (const needle of needles) {
        const exact = token === needle;
        const nested = (needle.includes(token) && token.length >= 5)
          || (token.includes(needle) && needle.length >= 5);
        if (!exact && !nested) continue;
        const score = (exact ? 200 : 100) + Math.min(token.length, needle.length);
        if (!best || score > best.score) best = { page, word, score };
      }
    }
  }
  return best ? { page: best.page, word: best.word } : undefined;
}

type SkuCell = { page: CanonicalPage; word: CanonicalWord; value: string };

/**
 * Late fill for empty goodsLines.N.productCode from an explicit native SKU/
 * product-code column. Never invents codes; never overwrites Vision; skips
 * values that equal the row HS (Vision already nulls that case).
 */
export function discoverInvoiceProductCodeFieldCandidates(
  canonical: CanonicalDocument,
  segmentId: string,
  goodsCandidates: FieldCandidateEnvelope,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const rowIndexes = goodsRowIndexes(goodsCandidates.fields);
  if (!rowIndexes.length) return { version: "1", fields };

  const emptyRows = rowIndexes.filter(
    (rowIndex) => !(goodsCandidates.fields[`goodsLines.${rowIndex}.productCode`]?.length),
  );
  if (!emptyRows.length) return { version: "1", fields };

  const headers: Array<{ page: CanonicalPage; word: CanonicalWord }> = [];
  for (const page of canonical.pages) {
    for (const word of page.words) {
      if (!isProductCodeHeader(word.text)) continue;
      if (nearTariffHeader(page, word)) continue;
      headers.push({ page, word });
    }
  }
  if (!headers.length) return { version: "1", fields };

  // Prefer the leftmost non-tariff product-code header (SKU usually left of description).
  headers.sort((a, b) => a.page.pageNumber - b.page.pageNumber || cx(a.word.bbox) - cx(b.word.bbox));
  const header = headers[0]!;
  const columnCenter = cx(header.word.bbox);
  const xTolerance = Math.max(0.035, (header.word.bbox.x1 - header.word.bbox.x0) * 0.8);

  const cells: SkuCell[] = [];
  for (const word of header.page.words) {
    if (cy(word.bbox) <= cy(header.word.bbox) + 0.008) continue;
    if (Math.abs(cx(word.bbox) - columnCenter) > xTolerance) continue;
    const width = word.bbox.x1 - word.bbox.x0;
    if (width <= 0.01 || width >= 0.28) continue;
    if (isProductCodeHeader(word.text)) continue;
    const value = compactSku(word.text);
    if (!value) continue;
    cells.push({ page: header.page, word, value });
  }
  if (!cells.length) return { version: "1", fields };

  const emit = (rowIndex: number, cell: SkuCell) => {
    const field = `goodsLines.${rowIndex}.productCode`;
    if (fields[field]?.length) return false;
    const hs = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`);
    const hsDigits = typeof hs?.value === "string" || typeof hs?.value === "number"
      ? hsLikeDigits(String(hs.value))
      : undefined;
    const compactValue = norm(cell.value).replace(/[^A-Z0-9]/g, "");
    if (hsDigits && (compactValue === hsDigits || compactValue.replace(/[^\d]/g, "") === hsDigits)) {
      return false;
    }
    fields[field] = [{
      candidateId: `${segmentId}:product-code:line-${rowIndex + 1}`,
      field,
      value: cell.value,
      confidence: 0.95,
      extractor: EXTRACTOR,
      evidence: [{
        segmentId,
        pageNumber: cell.page.pageNumber,
        bbox: cell.word.bbox,
        text: cell.word.text,
        contentSource: cell.word.source,
      }],
    }];
    return true;
  };

  for (const rowIndex of emptyRows) {
    const hs = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`);
    const description = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.description`);
    const quantity = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.quantity`);
    const evidence = (hs ?? description ?? quantity)?.evidence?.[0];
    let page: CanonicalPage | undefined;
    let anchorBox: CanonicalBBox | undefined;
    if (evidence?.bbox) {
      page = canonical.pages.find((item) => item.pageNumber === evidence.pageNumber);
      anchorBox = evidence.bbox;
    }
    if (!page || !anchorBox) {
      const located = locateTextAnchor(
        canonical,
        evidence?.pageNumber,
        hs?.value,
        description?.value,
        quantity?.value,
      );
      if (!located) continue;
      page = located.page;
      anchorBox = located.word.bbox;
    }
    if (page.pageNumber !== header.page.pageNumber) continue;
    const looseY = Math.max(0.04, (anchorBox.y1 - anchorBox.y0) * 4);
    const nearby = cells
      .filter((cell) => Math.abs(cy(cell.word.bbox) - cy(anchorBox!)) <= looseY)
      .sort((a, b) =>
        Math.abs(cy(a.word.bbox) - cy(anchorBox!)) - Math.abs(cy(b.word.bbox) - cy(anchorBox!)),
      );
    if (nearby[0]) emit(rowIndex, nearby[0]);
  }

  const stillEmpty = emptyRows.filter((rowIndex) => !fields[`goodsLines.${rowIndex}.productCode`]?.length);
  if (
    stillEmpty.length > 0
    && cells.length === stillEmpty.length
    && stillEmpty.length === emptyRows.length
  ) {
    const ordered = cells
      .slice()
      .sort((a, b) => cy(a.word.bbox) - cy(b.word.bbox));
    for (let index = 0; index < stillEmpty.length; index += 1) {
      emit(stillEmpty[index]!, ordered[index]!);
    }
  }

  return { version: "1", fields };
}
