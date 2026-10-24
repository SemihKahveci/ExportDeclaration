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

const EXTRACTOR = "invoice-hs-generic-v1";
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

/** HS/HSN/GTIP/tariff tokens: 6–14 digits (EU 6/8/10 and TR 12 common). */
export function hsLikeDigits(text: unknown): string | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  const digits = text.replace(/[^\d]/g, "");
  if (!/^\d{6,14}$/.test(digits)) return undefined;
  // Reject obvious years / short amounts mistaken for tariff when only 4 digits remain.
  if (digits.length === 6 && /^(19|20)\d{4}$/.test(digits)) return undefined;
  return digits;
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

function codeNeedles(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const out: string[] = [];
  const primary = primaryCodeToken(value);
  if (primary) out.push(primary);
  for (const part of value.trim().split(/[.\s/_-]+/)) {
    const compact = norm(part).replace(/[^A-Z0-9]/g, "");
    if (compact.length >= 5 && /\d/.test(compact)) out.push(compact);
  }
  return [...new Set(out)];
}

function descriptionNeedles(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const stop = new Set([
    "THE", "AND", "FOR", "WITH", "FROM", "FACE", "NECK", "PCS", "ADET", "KG",
    "FORMULA", "SAME", "SAMPLE", "OFFERED", "OTHER", "PARTS", "ACCESSORIES"
  ]);
  const out: string[] = [];
  for (const token of value.trim().split(/\s+/)) {
    const compact = norm(token).replace(/[^A-Z0-9]/g, "");
    if (compact.length < 5 || stop.has(compact)) continue;
    if (/^\d+$/.test(compact)) continue;
    out.push(compact);
  }
  return [...new Set(out)].slice(0, 4);
}

function locateTextAnchor(
  canonical: CanonicalDocument,
  preferredPage: number | undefined,
  productValue: unknown,
  descriptionValue: unknown
): { page: CanonicalPage; word: CanonicalWord } | undefined {
  const needles = [...codeNeedles(productValue), ...descriptionNeedles(descriptionValue)];
  if (!needles.length) return undefined;

  const pages = preferredPage != null
    ? [
      ...canonical.pages.filter((page) => page.pageNumber === preferredPage),
      ...canonical.pages.filter((page) => page.pageNumber !== preferredPage)
    ]
    : canonical.pages;

  let best: { page: CanonicalPage; word: CanonicalWord; score: number } | undefined;
  for (const page of pages) {
    for (const word of page.words) {
      const token = primaryCodeToken(word.text) ?? norm(word.text).replace(/[^A-Z0-9]/g, "");
      if (!token || token.length < 4) continue;
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

function hsHeaderBoost(page: CanonicalPage, centerX: number): number {
  let boost = 0;
  for (const word of page.words) {
    if (Math.abs(cx(word.bbox) - centerX) > 0.08) continue;
    if (/\b(?:HSN?|GT[İI]P|TARIFF|CUSTOMS|CODU|CODE)\b/i.test(word.text)) boost += 50;
  }
  return boost;
}

type HsCell = { rowIndex?: number; page: CanonicalPage; word: CanonicalWord; digits: string };
type Cluster = { center: number; cells: HsCell[]; score: number };

/**
 * Foundation 8.25.7 — row-level HS/HSN column discovery for Vision goods rows
 * that omitted tariff codes. Layout-independent: learns a stable digit column
 * near goods anchors (or 1:1 Y-order zip when every row lacks product codes).
 * Fills only empty hsCode fields; never overwrites Vision.
 */
export function discoverInvoiceHsFieldCandidates(
  canonical: CanonicalDocument,
  segmentId: string,
  goodsCandidates: FieldCandidateEnvelope,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const rowIndexes = goodsRowIndexes(goodsCandidates.fields);
  if (!rowIndexes.length) return { version: "1", fields };

  const emptyRows = rowIndexes.filter(
    (rowIndex) => !(goodsCandidates.fields[`goodsLines.${rowIndex}.hsCode`]?.length)
  );
  if (!emptyRows.length) return { version: "1", fields };

  // Global HS-like words for column clustering.
  const hsWords: HsCell[] = [];
  for (const page of canonical.pages) {
    for (const word of page.words) {
      const digits = hsLikeDigits(word.text);
      if (!digits) continue;
      const width = word.bbox.x1 - word.bbox.x0;
      if (width <= 0.01 || width >= 0.35) continue;
      hsWords.push({ page, word, digits });
    }
  }
  if (!hsWords.length) return { version: "1", fields };

  const clusters: Cluster[] = [];
  const clusterTolerance = 0.03;
  for (const cell of hsWords.slice().sort((a, b) => cx(a.word.bbox) - cx(b.word.bbox))) {
    const x = cx(cell.word.bbox);
    let cluster = clusters.find((item) => Math.abs(item.center - x) <= clusterTolerance);
    if (!cluster) {
      cluster = { center: x, cells: [], score: 0 };
      clusters.push(cluster);
    }
    cluster.cells.push(cell);
    cluster.center = cluster.cells.reduce((sum, item) => sum + cx(item.word.bbox), 0) / cluster.cells.length;
  }

  for (const cluster of clusters) {
    const lengths = cluster.cells.map((cell) => cell.digits.length);
    const lengthMode = lengths.sort((a, b) =>
      lengths.filter((value) => value === b).length - lengths.filter((value) => value === a).length
    )[0] ?? 0;
    const sameLength = cluster.cells.filter((cell) => cell.digits.length === lengthMode).length;
    const header = cluster.cells.reduce(
      (sum, cell) => sum + hsHeaderBoost(cell.page, cluster.center),
      0
    );
    cluster.score = sameLength * 10 + cluster.cells.length + header;
  }

  const minimumCoverage = Math.max(2, Math.ceil(emptyRows.length * 0.5));
  const stable = clusters
    .filter((cluster) => cluster.cells.length >= minimumCoverage)
    .sort((a, b) => b.score - a.score);
  const hsCluster = stable[0];
  if (!hsCluster) return { version: "1", fields };

  const xTolerance = Math.max(
    0.03,
    Math.max(...hsCluster.cells.map((cell) => Math.abs(cx(cell.word.bbox) - hsCluster.center))) + 0.01
  );

  const emitHs = (rowIndex: number, page: CanonicalPage, word: CanonicalWord, digits: string) => {
    const field = `goodsLines.${rowIndex}.hsCode`;
    if (fields[field]?.length) return false;
    const candidate: FieldCandidate<string> = {
      candidateId: `${segmentId}:hs:line-${rowIndex + 1}`,
      field,
      value: digits,
      confidence: 0.96,
      extractor: EXTRACTOR,
      evidence: [{
        segmentId,
        pageNumber: page.pageNumber,
        bbox: word.bbox,
        text: word.text,
        contentSource: word.source,
      }],
    };
    fields[field] = [candidate];
    return true;
  };

  for (const rowIndex of emptyRows) {
    const product = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.productCode`);
    const description = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.description`);
    const evidence = (product ?? description)?.evidence?.[0];
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
        product?.value,
        description?.value
      );
      if (!located) continue;
      page = located.page;
      anchorBox = located.word.bbox;
    }
    const looseY = Math.max(0.04, (anchorBox.y1 - anchorBox.y0) * 4);
    const nearby = hsCluster.cells
      .filter((cell) => {
        if (cell.page.pageNumber !== page!.pageNumber) return false;
        if (Math.abs(cy(cell.word.bbox) - cy(anchorBox!)) > looseY) return false;
        if (Math.abs(cx(cell.word.bbox) - hsCluster.center) > xTolerance) return false;
        return true;
      })
      .sort((a, b) =>
        Math.abs(cy(a.word.bbox) - cy(anchorBox!)) - Math.abs(cy(b.word.bbox) - cy(anchorBox!))
      );
    if (nearby[0]) emitHs(rowIndex, nearby[0].page, nearby[0].word, nearby[0].digits);
  }

  // 1:1 Y-order zip only when every empty row still lacks HS and the cluster
  // cardinality matches — typical when Vision bound description/qty but left
  // the tariff column blank and product codes are absent (no safe text anchors).
  const stillEmpty = emptyRows.filter((rowIndex) => !fields[`goodsLines.${rowIndex}.hsCode`]?.length);
  const anyProduct = emptyRows.some((rowIndex) =>
    firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.productCode`)?.value
  );
  if (
    stillEmpty.length > 0
    && !anyProduct
    && hsCluster.cells.length === stillEmpty.length
    && stillEmpty.length === emptyRows.length
  ) {
    const orderedCells = hsCluster.cells
      .slice()
      .sort((a, b) => a.page.pageNumber - b.page.pageNumber || cy(a.word.bbox) - cy(b.word.bbox));
    for (let index = 0; index < stillEmpty.length; index += 1) {
      const cell = orderedCells[index]!;
      const rowIndex = stillEmpty[index]!;
      emitHs(rowIndex, cell.page, cell.word, cell.digits);
    }
  }

  return { version: "1", fields };
}
