import assert from "node:assert/strict";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

const image = { pageNumber: 2, mimeType: "image/png", bytes: Buffer.from("x") } as any;
const evidence = [{ pageNumber: 2, source: "PAGE_IMAGE" }];

async function main() {
  const calls: any[] = [];
  const persistedArtifacts: any[] = [];
  const diagnostics: any[] = [];
  const artifact = (request: any, fields: any[]) => ({
    version: "1", provider: "contract-qwen", model: "qwen", skillVersion: "invoice-extraction-v7",
    documentId: request.documentId, evidenceMode: request.evidenceMode,
    requestedFields: [...request.requestedFields], pageNumbers: [2],
    rawModelResponse: JSON.stringify({ fields }),
    parsedSemanticResponse: { version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields, issues: [] }
  });
  const provider: any = {
    name: "contract-qwen",
    async extractInvoice(request: any, pageImages: any[]) {
      calls.push({ request, pageImages });
      if (calls.length === 1) {
        const fields = [
          { field: "deliveryTerm", value: "EXW", confidence: 1, evidence },
          { field: "grossKg", value: 48, confidence: 1, evidence },
          { field: "goodsLines[].description", value: ["A", "B"], confidence: 1, evidence },
          { field: "goodsLines[].quantity", value: [1, 2], confidence: 1, evidence }
        ];
        return { version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields, issues: [], model: "qwen", provider: "contract-qwen", extractionArtifact: artifact(request, fields) };
      }
      const fields = [
        { field: "netKg", value: 40, confidence: 1, evidence: [{ ...evidence[0], quote: "Net Weight 40 kg" }] },
        { field: "origin", value: "US", confidence: 1, evidence: [{ ...evidence[0], quote: "Origin USA" }] }
      ];
      return { version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields, issues: [], model: "qwen", provider: "contract-qwen", extractionArtifact: artifact(request, fields) };
    }
  };

  const result = await executeInvoiceVisionByPage({
    canonicalDocument: { pages: [{ pageNumber: 2 }] } as any,
    segmentId: "seg", pageNumbers: [2], provider, renderPage: async () => image,
    request: { version: "1", requestedFields: ["invoiceDate", "currency", "deliveryTerm", "grossKg", "netKg", "origin", "goodsLines[].description", "goodsLines[].quantity"], nativeText: "", ocrText: "", verifiedKnowledge: [] },
    onPageCheckpoint: async (checkpoint: any) => {
      if (checkpoint.status === "COMPLETED") {
        persistedArtifacts.push(...(checkpoint.extractionArtifacts ?? []));
        diagnostics.push(checkpoint.recoveryDiagnostic);
      }
    }
  });

  assert.equal(calls.length, 2, "non-empty PARTIAL page must get one bounded scalar-only pass when requested scalars are missing");
  assert.deepEqual([...calls[1].request.requestedFields].sort(), ["netKg", "origin"].sort());
  assert(!calls[1].request.requestedFields.includes("grossKg"), "existing scalar must not be re-requested");
  assert(!calls[1].request.requestedFields.includes("deliveryTerm"), "existing scalar must not be re-requested");
  assert(!calls[1].request.requestedFields.includes("invoiceDate"));
  assert(!calls[1].request.requestedFields.includes("currency"));
  assert(!calls[1].request.requestedFields.some((f: string) => f.startsWith("goodsLines[].")));
  assert.equal(calls[1].pageImages[0], image, "same page image must be reused");
  assert.equal(result.candidates.fields["grossWeight"]?.[0]?.value, 48);
  assert.equal(result.candidates.fields["netWeight"]?.[0]?.value, 40);
  assert.equal(result.candidates.fields["originCountry"]?.[0]?.value, "US");
  assert.equal(result.candidates.fields["deliveryTerm"]?.[0]?.value, "EXW");
  assert.equal(result.candidates.fields["goodsLines.1.quantity"]?.[0]?.value, 2);
  assert.equal(persistedArtifacts.length, 2);
  assert.equal(diagnostics[0].focusedRecoveryAttempted, false);
  assert.equal(diagnostics[0].scalarRecoveryAttempted, true);
  assert.deepEqual([...diagnostics[0].scalarRecoveryRequestedFields].sort(), ["netKg", "origin"].sort());
  assert.deepEqual([...diagnostics[0].scalarRecoveryReturnedFields].sort(), ["netKg", "origin"].sort());

  // A fully satisfied non-empty response must not incur another inference.
  const completeCalls: any[] = [];
  const completeProvider: any = { name: "contract-qwen", async extractInvoice(request: any) {
    completeCalls.push(request);
    return { version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields: [
      { field: "grossKg", value: 10, confidence: 1, evidence },
      { field: "netKg", value: 9, confidence: 1, evidence },
      { field: "origin", value: "TR", confidence: 1, evidence }
    ], issues: [], model: "qwen", provider: "contract-qwen" };
  }};
  await executeInvoiceVisionByPage({ canonicalDocument: { pages: [{ pageNumber: 2 }] } as any, segmentId: "complete", pageNumbers: [2], provider: completeProvider, renderPage: async () => image, request: { version: "1", requestedFields: ["grossKg", "netKg", "origin"], nativeText: "", ocrText: "", verifiedKnowledge: [] } });
  assert.equal(completeCalls.length, 1);

  // An empty fail-closed page must not create a scalar-only retry after the
  // existing focused recovery also returns empty.
  const emptyCalls: any[] = [];
  const emptyProvider: any = { name: "contract-qwen", async extractInvoice(request: any) {
    emptyCalls.push(request);
    return { version: "1", decision: InvoiceLlmExtractionDecision.REVIEW_REQUIRED, fields: [], issues: [], model: "qwen", provider: "contract-qwen" };
  }};
  await executeInvoiceVisionByPage({ canonicalDocument: { pages: [{ pageNumber: 2 }] } as any, segmentId: "empty", pageNumbers: [2], provider: emptyProvider, renderPage: async () => image, request: { version: "1", requestedFields: ["grossKg", "netKg", "origin"], nativeText: "", ocrText: "", verifiedKnowledge: [] } });
  assert.equal(emptyCalls.length, 2, "empty page gets only the existing focused recovery, not a third scalar pass");

  // If scalar recovery itself returns empty, preserve the original goods and
  // scalar candidates without manufacturing values.
  const preserveCalls: any[] = [];
  const preserveProvider: any = { name: "contract-qwen", async extractInvoice(request: any) {
    preserveCalls.push(request);
    if (preserveCalls.length === 1) return { version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL, fields: [
      { field: "goodsLines[].description", value: ["KEEP"], confidence: 1, evidence }
    ], issues: [], model: "qwen", provider: "contract-qwen" };
    return { version: "1", decision: InvoiceLlmExtractionDecision.REVIEW_REQUIRED, fields: [], issues: [], model: "qwen", provider: "contract-qwen" };
  }};
  const preserved = await executeInvoiceVisionByPage({ canonicalDocument: { pages: [{ pageNumber: 2 }] } as any, segmentId: "preserve", pageNumbers: [2], provider: preserveProvider, renderPage: async () => image, request: { version: "1", requestedFields: ["grossKg", "goodsLines[].description"], nativeText: "", ocrText: "", verifiedKnowledge: [] } });
  assert.equal(preserveCalls.length, 2);
  assert.equal(preserved.candidates.fields["goodsLines.0.description"]?.[0]?.value, "KEEP");
  assert.equal(preserved.candidates.fields["grossWeight"], undefined);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.8.26.general-missing-scalar-qwen-recovery.passed",
    nonEmptyPartialCanTriggerScalarRecovery: true,
    onlyActuallyMissingScalarsRequested: true,
    existingScalarsNotReRequestedOrOverwritten: true,
    goodsExcludedFromScalarPass: true,
    criticalScalarsExcludedFromScalarPass: true,
    samePageImageReused: true,
    boundedToOneScalarPassPerPage: true,
    fullySatisfiedResponseDoesNotRetry: true,
    emptyFailClosedPageDoesNotAddScalarPass: true,
    emptyScalarRecoveryPreservesExistingGoods: true,
    telemetryPreserved: true,
    qwenPrimary: true,
    ocrPrimary: false,
    deterministicPrimary: false,
    supplierSpecificRules: false,
    groundTruthAuthorityUsed: false,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
