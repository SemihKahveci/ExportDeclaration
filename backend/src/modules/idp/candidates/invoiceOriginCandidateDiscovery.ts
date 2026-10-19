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

const EXTRACTOR = "invoice-origin-generic-v1";
const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;

function norm(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}
function compactAlphaCell(text: string): boolean {
  const t = norm(text);
  return /^[A-ZÀ-Ž][A-ZÀ-Ž .'-]{1,30}$/.test(t) && !/^\d/.test(t);
}
function cy(box: CanonicalBBox): number { return (box.y0 + box.y1) / 2; }
function cx(box: CanonicalBBox): number { return (box.x0 + box.x1) / 2; }

function firstCandidate(fields: FieldCandidateEnvelope["fields"], field: string): FieldCandidate | undefined {
  const values = fields[field] ?? [];
  return values.slice().sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
}

function primaryCodeToken(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const first = value.trim().split(/\s+/)[0]!;
  const compact = norm(first).replace(/[^A-Z0-9]/g, "");
  return compact.length >= 4 ? compact : undefined;
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
  const needles = [primaryCodeToken(productValue), primaryCodeToken(hsValue)].filter(
    (value): value is string => Boolean(value)
  );
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
      const token = primaryCodeToken(word.text);
      if (!token) continue;
      for (const needle of needles) {
        const exact = token === needle;
        const nested = (needle.includes(token) && token.length >= 6)
          || (token.includes(needle) && needle.length >= 6);
        if (!exact && !nested) continue;
        const score = exact ? needle.length + 100 : Math.min(token.length, needle.length);
        if (!best || score > best.score) best = { page, word, score };
      }
    }
  }
  return best ? { page: best.page, word: best.word } : undefined;
}

type RowCell = { rowIndex: number; page: CanonicalPage; word: CanonicalWord; anchorX: number };
type Cluster = { center: number; cells: RowCell[]; rows: Set<number> };

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
 * Learns a stable compact-text column left of proven goods-row anchors.
 * Anchors may come from candidate bbox evidence or, when Vision omitted bbox,
 * from product/HS token matches in the canonical text layer. No supplier names,
 * country allow-lists, or fixed coordinates.
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
      if (cx(word.bbox) >= cx(anchorBox)) continue;
      const width = word.bbox.x1 - word.bbox.x0;
      if (width <= 0.015 || width >= 0.14) continue;
      if (!compactAlphaCell(word.text)) continue;
      rowCells.push({ rowIndex, page, word, anchorX: cx(anchorBox) });
    }
  }

  const clusters: Cluster[] = [];
  const clusterTolerance = 0.025;
  for (const cell of rowCells.slice().sort((a, b) => cx(a.word.bbox) - cx(b.word.bbox))) {
    const x = cx(cell.word.bbox);
    let cluster = clusters.find(item => Math.abs(item.center - x) <= clusterTolerance);
    if (!cluster) {
      cluster = { center: x, cells: [], rows: new Set<number>() };
      clusters.push(cluster);
    }
    cluster.cells.push(cell);
    cluster.rows.add(cell.rowIndex);
    cluster.center = cluster.cells.reduce((sum, item) => sum + cx(item.word.bbox), 0) / cluster.cells.length;
  }

  const minimumCoverage = Math.max(3, Math.ceil(rowIndexes.length * 0.60));
  const stable = clusters
    .filter(cluster => cluster.rows.size >= minimumCoverage)
    .sort((a, b) => a.center - b.center);
  const originCluster = stable[0];
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

  for (const rowIndex of rowIndexes) {
    const candidates = originCluster.cells
      .filter(cell => cell.rowIndex === rowIndex && Math.abs(cx(cell.word.bbox) - originCluster.center) <= xTolerance)
      .sort((a, b) =>
        Math.abs(cx(a.word.bbox) - originCluster.center) - Math.abs(cx(b.word.bbox) - originCluster.center)
      );
    const selected = candidates[0];
    if (!selected) continue;

    const field = `goodsLines.${rowIndex}.origin`;
    const candidate: FieldCandidate<string> = {
      candidateId: `${segmentId}:origin:line-${rowIndex + 1}`,
      field,
      value: selected.word.text.trim(),
      confidence: 0.98,
      extractor: EXTRACTOR,
      evidence: [{
        segmentId,
        pageNumber: selected.page.pageNumber,
        bbox: selected.word.bbox,
        text: selected.word.text,
        contentSource: selected.word.source,
      }],
    };
    fields[field] = [candidate];
  }

  console.info("idp.origin.discovery", {
    segmentId,
    rowCount: rowIndexes.length,
    bboxAnchors,
    textAnchors,
    rowCells: rowCells.length,
    stableClusters: stable.length,
    emitted: Object.keys(fields).length
  });

  return { version: "1", fields };
}
