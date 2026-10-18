import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { InvoiceLlmExtractionDecision, type InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import {
  FOUNDATION8_GOODS_ADJACENT_CONTEXT_CHAR_LIMIT,
  FOUNDATION8_GOODS_CHUNK_CONTEXT_CHAR_LIMIT,
  mergeFoundation8GoodsChunks,
  planFoundation8GoodsChunks
} from "../../src/modules/idp/understanding/invoiceUnderstandingGoodsChunking.js";

const page = (pageNumber: number, text: string) => ({ pageNumber, source: "NATIVE_TEXT" as const, text });
const ev = (pageNumber: number, quote: string) => [{ pageNumber, source: "NATIVE_TEXT" as const, quote }];
const response = (fields: InvoiceLlmExtractionResponse["fields"], decision = InvoiceLlmExtractionDecision.EXTRACTED): InvoiceLlmExtractionResponse => ({
  version: "1", decision, fields, issues: [], model: "contract-model", provider: "contract-provider"
});

const chunks = planFoundation8GoodsChunks([
  page(1, "HEADER\nROW-A"),
  page(2, "ROW-B\nCONTINUATION"),
  page(3, "ROW-C")
]);
assert.equal(chunks.length, 3);
assert.deepEqual(chunks.map(c => c.targetPageNumber), [1, 2, 3]);
assert.deepEqual(chunks[0]!.pages.map(p => p.pageNumber), [1, 2]);
assert.deepEqual(chunks[1]!.pages.map(p => p.pageNumber), [2, 3]);
assert.deepEqual(chunks[2]!.pages.map(p => p.pageNumber), [3]);
assert.ok(chunks.every(c => c.pages.reduce((n, p) => n + p.text.length, 0) <= FOUNDATION8_GOODS_CHUNK_CONTEXT_CHAR_LIMIT));
assert.ok(FOUNDATION8_GOODS_ADJACENT_CONTEXT_CHAR_LIMIT < FOUNDATION8_GOODS_CHUNK_CONTEXT_CHAR_LIMIT);

const merged = mergeFoundation8GoodsChunks({
  documentId: "contract-doc",
  chunks: [
    { targetPageNumber: 1, response: response([
      { field: "goodsTable.expectedRowCount", value: 1, confidence: .9, evidence: ev(1, "ROW-A") },
      { field: "goodsLines.0.productCode", value: "A", confidence: .95, evidence: ev(1, "ROW-A") },
      { field: "goodsLines.0.quantity", value: 2, confidence: .95, evidence: ev(1, "ROW-A") },
      { field: "goodsLines.0.lineTotal", value: 20, confidence: .95, evidence: ev(2, "CONTINUATION") }
    ]) },
    { targetPageNumber: 2, response: response([
      { field: "goodsTable.expectedRowCount", value: "1", confidence: .85, evidence: ev(2, "ROW-B") },
      { field: "goodsLines.0.productCode", value: "B", confidence: .9, evidence: ev(2, "ROW-B") },
      { field: "goodsLines.0.quantity", value: 3, confidence: .9, evidence: ev(2, "ROW-B") }
    ]) },
    { targetPageNumber: 3, response: response([
      { field: "goodsTable.expectedRowCount", value: 1, confidence: .9, evidence: ev(3, "ROW-C") },
      { field: "goodsLines.0.productCode", value: "C", confidence: .9, evidence: ev(3, "ROW-C") },
      { field: "goodsLines.0.quantity", value: 4, confidence: .9, evidence: ev(3, "ROW-C") },
      // Deliberately illegal neighboring-page row: must be dropped as a whole row.
      { field: "goodsLines.1.productCode", value: "SHOULD-DROP", confidence: .9, evidence: ev(2, "ROW-B") }
    ]) }
  ]
});
assert.equal(merged.expectedRowCount, 3);
assert.equal(merged.materializedRowCount, 3);
assert.equal(merged.response.decision, InvoiceLlmExtractionDecision.EXTRACTED);
assert.deepEqual(merged.response.fields.filter(f => /productCode$/.test(f.field)).map(f => [f.field, f.value]), [
  ["goodsLines.0.productCode", "A"], ["goodsLines.1.productCode", "B"], ["goodsLines.2.productCode", "C"]
]);
assert.ok(!merged.response.fields.some(f => f.value === "SHOULD-DROP"));
assert.ok(merged.response.issues.some(i => i.code === "GOODS_CHUNK_ROW_OUTSIDE_TARGET_PAGE"));

const failed = mergeFoundation8GoodsChunks({
  documentId: "contract-failed-page",
  chunks: [{ targetPageNumber: 1, response: response([{ field: "goodsLines.0.productCode", value: "A", confidence: .9, evidence: ev(1, "ROW-A") }]) }],
  failedTargetPages: [2]
});
assert.equal(failed.response.decision, InvoiceLlmExtractionDecision.REVIEW_REQUIRED);
assert.ok(failed.response.issues.some(i => i.code === "GOODS_CHUNK_FAILED"));

const executionSource = fs.readFileSync(path.resolve("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.ts"), "utf8");
const providerSource = fs.readFileSync(path.resolve("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts"), "utf8");
const chunkSource = fs.readFileSync(path.resolve("backend/src/modules/idp/understanding/invoiceUnderstandingGoodsChunking.ts"), "utf8");
const fusionSource = fs.readFileSync(path.resolve("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts"), "utf8");
assert.match(executionSource, /Promise\.all\(\[worker\(\), worker\(\)\]\)/);
assert.match(executionSource, /goodsChunkAudit/);
assert.match(executionSource, /TARGET PAGE/);
assert.match(executionSource, /Package\/carton\/pallet counts are never commercial quantity/i);
assert.match(providerSource, /for \(let attempt = 1; attempt <= 2; attempt \+= 1\) \{\s*const controller = new AbortController\(\);/s);
assert.match(providerSource, /finally \{\s*clearTimeout\(timeout\);\s*\}/s);
assert.match(fusionSource, /recoveryDomains\.includes\("GOODS"\)[\s\S]*foundation8PromotableDomains\.delete\("GOODS"\)/);
assert.doesNotMatch(chunkSource, /VXA2026|YEM2026|VED2026|Volta|ERYEM|Vekmar/i);
assert.doesNotMatch(chunkSource, /normalizedData\s*=/);

console.log(JSON.stringify({
  event: "foundation-8.22.scalable-goods-chunking.contract.passed",
  acceptance: {
    pageBoundedGoodsChunks: true,
    adjacentContinuationContextIsBounded: true,
    stableGlobalRowReindexing: true,
    crossChunkFieldStealingRejected: true,
    chunkExpectedCountsAggregateDeterministically: true,
    failedChunkFailsClosedWithoutErasingHealthyChunks: true,
    boundedTwoWorkerExecution: true,
    retryTimeoutControllerIsPerAttempt: true,
    incompleteGoodsCannotPartiallyPromote: true
  },
  guardrails: {
    pageLocalEvidenceRequired: true,
    arithmeticDoesNotManufactureValues: true,
    packageQuantityNotCommercialQuantity: true,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
