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
 * Foundation 5.5A.4 — row-level origin discovery.
 *
 * The canonical documents used by the invoice pipeline do not reliably expose
 * the table header, so this extractor learns stable compact-text columns from
 * already-proven goods rows. It does not use supplier names, country names, or
 * fixed x coordinates. The left-most stable compact-text column is selected as
 * the row-origin column; if the structure is not stable enough, no candidate is
 * emitted and normalization/review fails closed.
 */
export function discoverInvoiceOriginFieldCandidates(
  canonical: CanonicalDocument,
  segmentId: string,
  goodsCandidates: FieldCandidateEnvelope,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const rowIndexes = goodsRowIndexes(goodsCandidates.fields);
  if (!rowIndexes.length) return { version: "1", fields };

  const rowCells: RowCell[] = [];
  for (const rowIndex of rowIndexes) {
    const hs = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`);
    const product = firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.productCode`);
    const anchor = hs ?? product;
    const evidence = anchor?.evidence?.[0];
    if (!evidence?.bbox) continue;
    const page = canonical.pages.find(item => item.pageNumber === evidence.pageNumber);
    if (!page) continue;

    const anchorBox = evidence.bbox;
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
  if (!originCluster) return { version: "1", fields };

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

  return { version: "1", fields };
}
