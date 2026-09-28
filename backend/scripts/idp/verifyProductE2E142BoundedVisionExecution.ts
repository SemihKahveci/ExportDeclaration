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

async function main() {
  const calls: number[][] = [];
  const provider: InvoiceLlmExtractionProvider = {
    name: "fake-bounded-vision",
    async extractInvoice(request: InvoiceLlmExtractionRequest, images: InvoiceLlmPageImage[]): Promise<InvoiceLlmExtractionResponse> {
      calls.push(images.map((image) => image.pageNumber));
      const page = images[0]!.pageNumber;
      if (page === 2) throw new Error("synthetic page timeout");
      return {
        version: "1",
        decision: InvoiceLlmExtractionDecision.PARTIAL,
        fields: [{
          field: "goodsLines[].hsCode",
          value: [`GTIP-${page}`],
          confidence: 0.9,
          evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }]
        }],
        issues: [],
        model: "fake",
        provider: "fake-bounded-vision"
      };
    }
  };

  const canonicalDocument = {
    version: "1",
    pages: [1,2,3].map((pageNumber) => ({
      pageNumber,
      width: 100,
      height: 100,
      rotation: 0,
      nativeText: "",
      nativeCharCount: 0,
      nativeWordCount: 0,
      ocrText: "",
      ocrWordCount: 0,
      words: []
    })),
    analysis: { pageCount: 3, nativeTextPageCount: 0, scannedPageCount: 3, ocrPageCount: 3, ocrWordCount: 0 }
  } as unknown as CanonicalDocument;

  const result = await executeInvoiceVisionByPage({
    canonicalDocument,
    segmentId: "invoice-segment-1",
    pageNumbers: [1,2,3],
    provider,
    renderPage: async (pageNumber) => ({
      pageNumber,
      mimeType: "image/png",
      bytes: Buffer.from(`page-${pageNumber}`)
    }),
    request: {
      version: "invoice-extraction-v1",
      requestedFields: ["goodsLines[].hsCode"],
      nativeText: "",
      ocrText: "",
      verifiedKnowledge: []
    }
  });

  assert.deepEqual(calls, [[1],[2],[3]], "Vision must be one page per provider call.");
  assert.deepEqual(result.checkpoints.map((item) => item.pageNumber), [1,3]);
  assert.deepEqual(result.failedPages.map((item) => item.pageNumber), [2]);
  assert.equal(result.failedPages[0]!.error, "synthetic page timeout");
  assert.deepEqual(Object.keys(result.candidates.fields).sort(), ["goodsLines.0.hsCode"]);
  const candidates = result.candidates.fields["goodsLines.0.hsCode"]!;
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((item) => item.value), ["GTIP-1","GTIP-3"]);
  assert.deepEqual(candidates.map((item) => item.evidence[0]!.pageNumber), [1,3]);
  assert.ok(candidates.every((item) => item.evidence[0]!.contentSource === "PAGE_IMAGE"));

  console.log(JSON.stringify({
    event: "product-e2e-1.4.2.bounded-vision-execution.passed",
    onePagePerInference: true,
    completedPagesSurviveLaterFailure: true,
    failedPageIsExplicit: true,
    pageImageProvenancePreserved: true,
    directNormalizedWrite: false
  }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
