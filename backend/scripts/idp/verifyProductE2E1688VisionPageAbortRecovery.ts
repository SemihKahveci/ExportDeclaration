import assert from "node:assert/strict";
import {
  InvoiceLlmExtractionDecision,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse,
  type InvoiceLlmPageImage
} from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";

const canonicalDocument = {
  version: "1",
  pages: [1,2,3].map((pageNumber) => ({ pageNumber, width: 100, height: 100, rotation: 0, nativeText: "", nativeCharCount: 0, nativeWordCount: 0, ocrText: "", ocrWordCount: 0, words: [] })),
  analysis: { pageCount: 3, nativeTextPageCount: 0, scannedPageCount: 3, ocrPageCount: 3, ocrWordCount: 0 }
} as unknown as CanonicalDocument;

function response(page: number): InvoiceLlmExtractionResponse {
  return {
    version: "1",
    decision: InvoiceLlmExtractionDecision.PARTIAL,
    fields: [{ field: "goodsLines[].productCode", value: [`P-${page}`], confidence: 1, evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }] }],
    issues: [], model: "fake", provider: "fake"
  };
}

async function main() {
  const calls: number[] = [];
  let page2Attempts = 0;
  const provider: InvoiceLlmExtractionProvider = {
    name: "fake-abort-recovery",
    async extractInvoice(_request: InvoiceLlmExtractionRequest, images: InvoiceLlmPageImage[]) {
      const page = images[0]!.pageNumber;
      calls.push(page);
      if (page === 2 && ++page2Attempts === 1) {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        throw error;
      }
      return response(page);
    }
  };

  const checkpoints: Array<{ pageNumber: number; status: string }> = [];
  const result = await executeInvoiceVisionByPage({
    canonicalDocument, segmentId: "segment-001", pageNumbers: [1,2,3], provider,
    renderPage: async (pageNumber) => ({ pageNumber, mimeType: "image/png", bytes: Buffer.from(`page-${pageNumber}`) }),
    request: { version: "invoice-extraction-v1", requestedFields: ["goodsLines[].productCode"], nativeText: "", ocrText: "", verifiedKnowledge: [] },
    onPageCheckpoint: async (checkpoint) => { checkpoints.push({ pageNumber: checkpoint.pageNumber, status: checkpoint.status }); }
  });

  assert.deepEqual(calls, [1,2,2,3], "Only the transiently aborted page may be retried once.");
  assert.equal(page2Attempts, 2);
  assert.deepEqual(result.failedPages, []);
  assert.deepEqual(result.checkpoints.map((item) => item.pageNumber), [1,2,3]);
  assert.deepEqual(checkpoints, [
    { pageNumber: 1, status: "COMPLETED" },
    { pageNumber: 2, status: "COMPLETED" },
    { pageNumber: 3, status: "COMPLETED" }
  ]);

  let hardFailureCalls = 0;
  const hardFailureProvider: InvoiceLlmExtractionProvider = {
    name: "fake-hard-failure",
    async extractInvoice() { hardFailureCalls += 1; throw new Error("Qwen vision response contract invalid"); }
  };
  const hardFailure = await executeInvoiceVisionByPage({
    canonicalDocument, segmentId: "segment-001", pageNumbers: [1], provider: hardFailureProvider,
    renderPage: async (pageNumber) => ({ pageNumber, mimeType: "image/png", bytes: Buffer.from("page") }),
    request: { version: "invoice-extraction-v1", requestedFields: ["invoiceNumber"], nativeText: "", ocrText: "", verifiedKnowledge: [] }
  });
  assert.equal(hardFailureCalls, 1, "Non-abort contract/model failures must not be retried.");
  assert.equal(hardFailure.failedPages.length, 1);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.8.8.vision-page-abort-recovery.passed",
    transientAbortRetriedOnce: true,
    successfulPagesNotRepeated: true,
    recoveredPageCheckpointedCompleted: true,
    nonAbortFailureNotRetried: true,
    boundedRetry: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
