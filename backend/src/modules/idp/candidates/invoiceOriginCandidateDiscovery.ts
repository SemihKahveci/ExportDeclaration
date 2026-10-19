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
import { canonicalizeVisionCountry } from "../llm/qwenVisionInvoiceProvider.js";

const EXTRACTOR = "invoice-origin-generic-v1";
const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;

function norm(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}
function compactAlphaCell(text: string): boolean {
  const t = norm(text);
  return /^[A-ZÀ-Ž][A-ZÀ-Ž .'-]{1,30}$/.test(t) && !/^\d/.test(t);
}
function countryLikeCell(text: string): boolean {
  return Boolean(canonicalizeVisionCountry(text));
}
function cy(box: CanonicalBBox): number { return (box.y0 + box.y1) / 2; }
function cx(box: CanonicalBBox): number { return (box.x0 + box.x1) / 2; }

function firstCandidate(fields: FieldCandidateEnvelope["fields"], field: string): FieldCandidate | undefined {
  const values = fields[field] ?? [];
  return values.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
}

/** Prefer a compact SKU/code token; strip description bleed after the first code-like token. */
function primaryCodeToken(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const tokens = value.trim().split(/\s+/);
  for (const token of tokens) {
    const compact = norm(token).replace(/[^A-Z0-9]/g, "");
    // Product codes are usually alphanumeric and longer than 2-letter ISO countries.
    if (compact.length >= 5 && /\d/.test(compact)) return compact;
    if (compact.length >= 6) return compact;
  }
  const first = norm(tokens[0] ?? "").replace(/[^A-Z0-9]/g, "");
  return first.length >= 4 ? first : undefined;
}

/** Product codes like AG.SCH.A9F74204 also need the trailing SKU segment as a needle. */
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

/**
 * Vision goods candidates often lack bbox evidence. Locate a row anchor by
 * matching product/HS tokens in the canonical text layer (layout-independent).
 */
function locateTextAnchor(
  canonical: CanonicalDocument,
  preferredPage: number | undefined,
  productValue: unknown,
  hsValue: unknown
): { page: CanonicalPage; word: CanonicalWord } | undefined {
  const productNeedles = codeNeedles(productValue);
  const hsNeedles = codeNeedles(hsValue);
  if (!productNeedles.length && !hsNeedles.length) return undefined;

  const pages = preferredPage != null
    ? [
      ...canonical.pages.filter((page) => page.pageNumber === preferredPage),
      ...canonical.pages.filter((page) => page.pageNumber !== preferredPage)
    ]
    : canonical.pages;

  let best: { page: CanonicalPage; word: CanonicalWord; score: number } | undefined;
  for (const page of pages) {
    for (const word of page.words) {
      const token = primaryCodeToken(word.text);
      if (!token) continue;
      for (const needle of productNeedles) {
        const exact = token === needle;
        const nested = (needle.includes(token) && token.length >= 5)
          || (token.includes(needle) && needle.length >= 5);
        if (!exact && !nested) continue;
        // Prefer product/SKU matches strongly over ubiquitous HS codes.
        const score = (exact ? 300 : 200) + Math.min(token.length, needle.length);
        if (!best || score > best.score) best = { page, word, score };
      }
      for (const needle of hsNeedles) {
        const exact = token === needle;
        const nested = (needle.includes(token) && token.length >= 6)
          || (token.includes(needle) && needle.length >= 6);
        if (!exact && !nested) continue;
        const score = (exact ? 80 : 40) + Math.min(token.length, needle.length);
        if (!best || score > best.score) best = { page, word, score };
      }
    }
  }
  return best ? { page: best.page, word: best.word } : undefined;
}

type RowCell = { rowIndex: number; page: CanonicalPage; word: CanonicalWord; anchorX: number; countryLike: boolean };
type Cluster = { center: number; cells: RowCell[]; rows: Set<number>; countryLikeRows: number };

function goodsRowIndexes(fields: FieldCandidateEnvelope["fields"]): number[] {
  return [...new Set(
    Object.keys(fields)
      .map(field => ROW_FIELD_RE.exec(field)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
  )].sort((a, b) => a - b);
}

/**
 * Foundation 5.5A.4 / 8.25.6 — row-level origin discovery.
 *
 * Learns a stable country-like column near proven goods-row anchors (left or
 * right). Anchors may come from candidate bbox evidence or product/HS text
 * matches. Prefers columns whose cells canonicalize to ISO countries.
 */
export function discoverInvoiceOriginFieldCandidates(
  canonical: CanonicalDocument,
  segmentId: string,
  goodsCandidates: FieldCandidateEnvelope,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const rowIndexes = goodsRowIndexes(goodsCandidates.fields);
  if (!rowIndexes.length) return { version: "1", fields };

  let bboxAnchors = 0;
  let textAnchors = 0;
  const rowCells: RowCell[] = [];
  for (const rowIndex of rowIndexes) {
    const hs = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`);
    const product = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.productCode`);
    const anchor = hs ?? product;
    const evidence = anchor?.evidence?.[0];
    let page: CanonicalPage | undefined;
    let anchorBox: CanonicalBBox | undefined;

    if (evidence?.bbox) {
      page = canonical.pages.find(item => item.pageNumber === evidence.pageNumber);
      anchorBox = evidence.bbox;
      if (page && anchorBox) bboxAnchors += 1;
    }

    if (!page || !anchorBox) {
      const located = locateTextAnchor(
        canonical,
        evidence?.pageNumber,
        product?.value,
        hs?.value
      );
      if (!located) continue;
      page = located.page;
      anchorBox = located.word.bbox;
      textAnchors += 1;
    }

    const tolerance = Math.max(0.018, (anchorBox.y1 - anchorBox.y0) * 1.8);
    for (const word of page.words) {
      if (Math.abs(cy(word.bbox) - cy(anchorBox)) > tolerance) continue;
      // Origin columns appear left or right of product/HS depending on layout.
      if (Math.abs(cx(word.bbox) - cx(anchorBox)) < 0.01) continue;
      const width = word.bbox.x1 - word.bbox.x0;
      // Country names such as FRANCE/THAILAND can be wider than short ISO tokens.
      if (width <= 0.008 || width >= 0.28) continue;
      const countryLike = countryLikeCell(word.text);
      if (!countryLike && !compactAlphaCell(word.text)) continue;
      rowCells.push({
        rowIndex,
        page,
        word,
        anchorX: cx(anchorBox),
        countryLike
      });
    }
  }

  const clusters: Cluster[] = [];
  const clusterTolerance = 0.025;
  for (const cell of rowCells.slice().sort((a, b) => cx(a.word.bbox) - cx(b.word.bbox))) {
    const x = cx(cell.word.bbox);
    let cluster = clusters.find(item => Math.abs(item.center - x) <= clusterTolerance);
    if (!cluster) {
      cluster = { center: x, cells: [], rows: new Set<number>(), countryLikeRows: 0 };
      clusters.push(cluster);
    }
    cluster.cells.push(cell);
    cluster.rows.add(cell.rowIndex);
    if (cell.countryLike) {
      cluster.countryLikeRows = [...cluster.rows].filter((rowIndex) =>
        cluster!.cells.some((item) => item.rowIndex === rowIndex && item.countryLike)
      ).length;
    }
    cluster.center = cluster.cells.reduce((sum, item) => sum + cx(item.word.bbox), 0) / cluster.cells.length;
  }

  const minimumCoverage = Math.max(3, Math.ceil(rowIndexes.length * 0.45));
  const stable = clusters
    .filter(cluster => cluster.rows.size >= minimumCoverage)
    .sort((a, b) => {
      const countryDelta = b.countryLikeRows - a.countryLikeRows;
      if (countryDelta !== 0) return countryDelta;
      return a.center - b.center;
    });
  const originCluster = stable.find((cluster) => cluster.countryLikeRows >= Math.max(3, Math.ceil(minimumCoverage * 0.5)))
    ?? stable[0];
  if (!originCluster) {
    console.info("idp.origin.discovery", {
      segmentId,
      rowCount: rowIndexes.length,
      bboxAnchors,
      textAnchors,
      rowCells: rowCells.length,
      stableClusters: 0,
      emitted: 0
    });
    return { version: "1", fields };
  }

  const xTolerance = Math.max(
    0.025,
    Math.max(...originCluster.cells.map(cell => Math.abs(cx(cell.word.bbox) - originCluster.center))) + 0.008,
  );

  const emitOrigin = (rowIndex: number, page: CanonicalPage, word: CanonicalWord) => {
    const iso = canonicalizeVisionCountry(word.text.trim());
    if (!iso) return false;
    const field = `goodsLines.${rowIndex}.origin`;
    const candidate: FieldCandidate<string> = {
      candidateId: `${segmentId}:origin:line-${rowIndex + 1}`,
      field,
      value: iso,
      confidence: 0.98,
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

  for (const rowIndex of rowIndexes) {
    const candidates = originCluster.cells
      .filter(cell => cell.rowIndex === rowIndex && Math.abs(cx(cell.word.bbox) - originCluster.center) <= xTolerance)
      .sort((a, b) => {
        if (a.countryLike !== b.countryLike) return a.countryLike ? -1 : 1;
        return Math.abs(cx(a.word.bbox) - originCluster.center) - Math.abs(cx(b.word.bbox) - originCluster.center);
      });
    const selected = candidates[0];
    if (!selected) continue;
    emitOrigin(rowIndex, selected.page, selected.word);
  }

  // Gap pass: multi-line goods rows often place the country below the product
  // code. Search the learned origin X between this row anchor and the next
  // row's anchor (same page), preferring the nearest country below the anchor.
  let gapFilled = 0;
  let gapMissed = 0;
  const anchorsByRow = new Map<number, { page: CanonicalPage; box: CanonicalBBox }>();
  for (const rowIndex of rowIndexes) {
    const hs = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`);
    const product = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.productCode`);
    const evidence = (hs ?? product)?.evidence?.[0];
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
        hs?.value
      );
      if (!located) continue;
      page = located.page;
      anchorBox = located.word.bbox;
    }
    anchorsByRow.set(rowIndex, { page, box: anchorBox });
  }

  for (const rowIndex of rowIndexes) {
    if (fields[`goodsLines.${rowIndex}.origin`]?.length) continue;
    const anchored = anchorsByRow.get(rowIndex);
    if (!anchored) {
      gapMissed += 1;
      continue;
    }
    const { page, box: anchorBox } = anchored;
    const anchorY = cy(anchorBox);
    const samePageNext = rowIndexes
      .filter((other) => other > rowIndex)
      .map((other) => anchorsByRow.get(other))
      .filter((item): item is { page: CanonicalPage; box: CanonicalBBox } =>
        Boolean(item && item.page.pageNumber === page.pageNumber)
      )
      .map((item) => cy(item.box))
      .filter((y) => y > anchorY + 0.002)
      .sort((a, b) => a - b)[0];
    const yMax = samePageNext ?? (anchorY + Math.max(0.12, (anchorBox.y1 - anchorBox.y0) * 8));
    const nearby = page.words
      .filter((word) => {
        const y = cy(word.bbox);
        // Prefer the column cell in the band below the product/HS anchor.
        if (y < anchorY - 0.01) return false;
        if (y > yMax - 0.002) return false;
        if (Math.abs(cx(word.bbox) - originCluster.center) > xTolerance) return false;
        return countryLikeCell(word.text);
      })
      .sort((a, b) => {
        const dy = Math.abs(cy(a.bbox) - anchorY) - Math.abs(cy(b.bbox) - anchorY);
        if (dy !== 0) return dy;
        return Math.abs(cx(a.bbox) - originCluster.center) - Math.abs(cx(b.bbox) - originCluster.center);
      });
    if (nearby[0] && emitOrigin(rowIndex, page, nearby[0])) gapFilled += 1;
    else gapMissed += 1;
  }

  console.info("idp.origin.discovery", {
    segmentId,
    rowCount: rowIndexes.length,
    bboxAnchors,
    textAnchors,
    rowCells: rowCells.length,
    stableClusters: stable.length,
    countryLikeRows: originCluster.countryLikeRows,
    gapFilled,
    gapMissed,
    emitted: Object.keys(fields).length
  });

  return { version: "1", fields };
}
