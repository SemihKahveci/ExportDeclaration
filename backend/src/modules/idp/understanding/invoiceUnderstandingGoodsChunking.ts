import { InvoiceLlmExtractionDecision, type InvoiceLlmExtractedField, type InvoiceLlmExtractionResponse } from "../domain/invoiceLlmExtraction.types.js";
import type { InvoiceUnderstandingCanonicalPage } from "./invoiceUnderstandingOrchestration.js";

export const FOUNDATION8_GOODS_CHUNKING_VERSION = "8.22.0" as const;
export const FOUNDATION8_GOODS_CHUNK_CONTEXT_CHAR_LIMIT = 42000;
export const FOUNDATION8_GOODS_ADJACENT_CONTEXT_CHAR_LIMIT = 12000;

export interface Foundation8GoodsChunk {
  chunkId: string;
  targetPageNumber: number;
  pages: InvoiceUnderstandingCanonicalPage[];
}

export interface Foundation8GoodsChunkMergeResult {
  response: InvoiceLlmExtractionResponse;
  sourceChunkCount: number;
  materializedRowCount: number;
  expectedRowCount?: number;
}

function nonEmptyPages(pages: readonly InvoiceUnderstandingCanonicalPage[]): InvoiceUnderstandingCanonicalPage[] {
  return [...pages]
    .filter(page => Number.isInteger(page.pageNumber) && page.pageNumber > 0 && page.text.trim())
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * One target page owns rows that BEGIN on that page. The following page is only
 * bounded continuation context, allowing a row split at a page break to remain atomic.
 * This keeps model input bounded without supplier coordinates or layout constants.
 */
export function planFoundation8GoodsChunks(
  pages: readonly InvoiceUnderstandingCanonicalPage[],
  targetPageNumbers?: ReadonlySet<number>
): Foundation8GoodsChunk[] {
  const ordered = nonEmptyPages(pages);
  return ordered.flatMap((target, index) => {
    if (targetPageNumbers?.size && !targetPageNumbers.has(target.pageNumber)) return [];
    const remaining = Math.max(0, FOUNDATION8_GOODS_CHUNK_CONTEXT_CHAR_LIMIT - target.text.length);
    const next = ordered[index + 1];
    const adjacentBudget = Math.min(remaining, FOUNDATION8_GOODS_ADJACENT_CONTEXT_CHAR_LIMIT);
    const continuation = next && adjacentBudget > 0
      ? { ...next, text: next.text.slice(0, adjacentBudget) }
      : undefined;
    return [{
      chunkId: `goods-p${target.pageNumber}`,
      targetPageNumber: target.pageNumber,
      pages: continuation ? [target, continuation] : [target]
    }];
  });
}

function rowIndex(field: string): number | undefined {
  const match = /^goodsLines\.(\d+)\./.exec(field);
  return match ? Number(match[1]) : undefined;
}

function rowFields(response: InvoiceLlmExtractionResponse): Map<number, InvoiceLlmExtractedField[]> {
  const rows = new Map<number, InvoiceLlmExtractedField[]>();
  for (const field of response.fields) {
    const index = rowIndex(field.field);
    if (index === undefined) continue;
    const list = rows.get(index) ?? [];
    list.push(field);
    rows.set(index, list);
  }
  return rows;
}

function scalarText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim().toLowerCase();
  return "";
}

function identityKey(fields: readonly InvoiceLlmExtractedField[]): string {
  const bySuffix = new Map(fields.map(field => [field.field.split(".").slice(-1)[0] ?? "", field]));
  const strong = ["productCode", "hsCode", "description"]
    .map(name => scalarText(bySuffix.get(name)?.value))
    .filter(Boolean);
  const pages = [...new Set(fields.flatMap(field => field.evidence.map(ref => ref.pageNumber)))].sort((a, b) => a - b);
  // Never dedupe on numeric values alone: that could collapse distinct commercial rows.
  return strong.length ? `${pages[0] ?? 0}|${strong.join("|")}` : "";
}

function reindexField(field: InvoiceLlmExtractedField, index: number): InvoiceLlmExtractedField {
  return { ...field, field: field.field.replace(/^goodsLines\.\d+\./, `goodsLines.${index}.`) };
}

function expectedCount(response: InvoiceLlmExtractionResponse): number | undefined {
  const value = response.fields.find(field => field.field === "goodsTable.expectedRowCount")?.value;
  const parsed = typeof value === "number" ? value : (typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : undefined);
  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Deterministic merge. Rows remain atomic: fields from different source rows are
 * never combined. Exact duplicate identity rows caused by continuation context are
 * dropped as whole rows; distinct rows are globally reindexed by target-page order.
 */
export function mergeFoundation8GoodsChunks(params: {
  documentId: string;
  chunks: ReadonlyArray<{ targetPageNumber: number; response: InvoiceLlmExtractionResponse }>;
  failedTargetPages?: readonly number[];
}): Foundation8GoodsChunkMergeResult {
  const ordered = [...params.chunks].sort((a, b) => a.targetPageNumber - b.targetPageNumber);
  const mergedRows: InvoiceLlmExtractedField[][] = [];
  const seenIdentity = new Set<string>();
  const issues = ordered.flatMap(chunk => chunk.response.issues);
  const expectedCandidates = ordered.map(chunk => expectedCount(chunk.response)).filter((v): v is number => v !== undefined);

  for (const chunk of ordered) {
    const rows = [...rowFields(chunk.response).entries()].sort(([a], [b]) => a - b);
    for (const [, fields] of rows) {
      // Ownership boundary: a chunk may emit only rows whose evidence starts on its target page.
      const firstEvidencePage = Math.min(...fields.flatMap(field => field.evidence.map(ref => ref.pageNumber)));
      if (!Number.isFinite(firstEvidencePage) || firstEvidencePage !== chunk.targetPageNumber) {
        issues.push({ code: "GOODS_CHUNK_ROW_OUTSIDE_TARGET_PAGE", message: `Dropped row from target page ${chunk.targetPageNumber}; first evidence page was ${firstEvidencePage}.` });
        continue;
      }
      const identity = identityKey(fields);
      if (identity && seenIdentity.has(identity)) continue;
      if (identity) seenIdentity.add(identity);
      mergedRows.push(fields);
    }
  }

  const expectedRowCount = expectedCandidates.length === ordered.length ? expectedCandidates.reduce((sum, value) => sum + value, 0) : undefined;
  const fields: InvoiceLlmExtractedField[] = [];
  if (expectedRowCount !== undefined) {
    const evidence = ordered.flatMap(chunk => chunk.response.fields.find(field => field.field === "goodsTable.expectedRowCount")?.evidence ?? []).slice(0, 1);
    if (evidence.length) {
      const confidences = ordered.flatMap(chunk => chunk.response.fields.filter(field => field.field === "goodsTable.expectedRowCount").map(field => field.confidence));
      fields.push({ field: "goodsTable.expectedRowCount", value: expectedRowCount, confidence: confidences.length ? Math.min(...confidences) : 0.5, evidence });
    }
  }
  mergedRows.forEach((row, index) => fields.push(...row.map(field => reindexField(field, index))));

  const failed = [...(params.failedTargetPages ?? [])];
  if (failed.length) issues.push({ code: "GOODS_CHUNK_FAILED", message: `Goods chunks failed closed for target pages: ${failed.join(", ")}.` });
  const incomplete = failed.length > 0 || (expectedRowCount !== undefined && mergedRows.length < expectedRowCount);
  return {
    response: {
      version: "1",
      decision: incomplete ? InvoiceLlmExtractionDecision.REVIEW_REQUIRED : (mergedRows.length ? InvoiceLlmExtractionDecision.EXTRACTED : InvoiceLlmExtractionDecision.PARTIAL),
      fields,
      issues,
      model: ordered[0]?.response.model ?? "foundation8-goods-chunk-merge",
      provider: ordered[0]?.response.provider ?? "foundation8-goods-chunk-merge"
    },
    sourceChunkCount: ordered.length,
    materializedRowCount: mergedRows.length,
    ...(expectedRowCount !== undefined ? { expectedRowCount } : {})
  };
}
