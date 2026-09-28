import assert from "node:assert/strict";
import {
  InvoiceLlmExtractionDecision,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse,
  type InvoiceLlmPageImage
} from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";

async function main() {
  const canonicalDocument = {
    version: "1",
    pages: [1, 2].map((pageNumber) => ({
      pageNumber, width: 100, height: 100, rotation: 0,
      nativeText: "", nativeCharCount: 0, nativeWordCount: 0,
      ocrText: "", ocrWordCount: 0, words: []
    })),
    analysis: { pageCount: 2, nativeTextPageCount: 0, scannedPageCount: 2, ocrPageCount: 2, ocrWordCount: 0 }
  } as unknown as CanonicalDocument;

  const calls: number[] = [];
  let failPage2 = true;
  const provider: InvoiceLlmExtractionProvider = {
    name: "fake-checkpoint-vision",
    async extractInvoice(_request: InvoiceLlmExtractionRequest, images: InvoiceLlmPageImage[]): Promise<InvoiceLlmExtractionResponse> {
      const page = images[0]!.pageNumber;
      calls.push(page);
      if (page === 2 && failPage2) throw new Error("synthetic restart boundary");
      return {
        version: "1",
        decision: InvoiceLlmExtractionDecision.PARTIAL,
        fields: [{
          field: "goodsLines[].hsCode",
          value: [`GTIP-${page}`],
          confidence: 0.9,
          evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }]
        }],
        issues: [], model: "fake", provider: "fake-checkpoint-vision"
      };
    }
  };

  const persisted: Record<number, { status: "COMPLETED" | "FAILED"; candidates?: FieldCandidateEnvelope; decision?: string; candidateCount?: number; error?: string }> = {};
  const common = {
    canonicalDocument,
    segmentId: "segment-001",
    pageNumbers: [1, 2],
    provider,
    renderPage: async (pageNumber: number) => ({ pageNumber, mimeType: "image/png", bytes: Buffer.from(`page-${pageNumber}`) }),
    request: { version: "1", requestedFields: ["goodsLines[].hsCode"], nativeText: "", ocrText: "", verifiedKnowledge: [] }
  };

  const first = await executeInvoiceVisionByPage({
    ...common,
    onPageCheckpoint: async (page) => { persisted[page.pageNumber] = page; }
  });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(persisted[1]?.status, "COMPLETED");
  assert.equal(persisted[2]?.status, "FAILED");
  assert.deepEqual(first.failedPages.map((item) => item.pageNumber), [2]);

  failPage2 = false;
  calls.length = 0;
  const completedPages = Object.fromEntries(Object.entries(persisted)
    .filter(([, page]) => page.status === "COMPLETED" && page.candidates && page.decision && typeof page.candidateCount === "number")
    .map(([pageNumber, page]) => [Number(pageNumber), { candidates: page.candidates!, decision: page.decision!, candidateCount: page.candidateCount! }]));

  const second = await executeInvoiceVisionByPage({
    ...common,
    completedPages,
    onPageCheckpoint: async (page) => { persisted[page.pageNumber] = page; }
  });

  assert.deepEqual(calls, [2], "Retry must not invoke Vision again for completed page 1.");
  assert.deepEqual(second.failedPages, []);
  assert.deepEqual(second.checkpoints.map((item) => item.pageNumber), [1, 2]);
  assert.equal(persisted[1]?.status, "COMPLETED");
  assert.equal(persisted[2]?.status, "COMPLETED");
  assert.deepEqual(Object.keys(second.candidates.fields).sort(), ["goodsLines.0.hsCode", "goodsLines.1.hsCode"]);
  assert.equal(second.candidates.fields["goodsLines.0.hsCode"]?.[0]?.value, "GTIP-1");
  assert.equal(second.candidates.fields["goodsLines.1.hsCode"]?.[0]?.value, "GTIP-2");

  console.log(JSON.stringify({
    event: "product-e2e-1.4.7.persisted-vision-checkpoint-resume.passed",
    completedPageReusedWithoutInference: true,
    failedPageRetried: true,
    priorPageCandidatesRecovered: true,
    goodsLineOffsetPreservedAcrossResume: true,
    failedCheckpointReplacedByCompletedCheckpoint: true,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
