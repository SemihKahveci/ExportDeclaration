import assert from "node:assert/strict";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { fuseInvoiceVisionIntoWorkerCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

async function main() {
  const { env } = await import("../../src/config/env.js");
  assert.equal(env.llmEnabled, true, "1.6.8.4 requires LLM_ENABLED=true in the container");
  assert.equal(env.llmVisionEnabled, true, "1.6.8.4 requires LLM_VISION_ENABLED=true in the container");
  assert.ok(env.llmVisionModel.trim(), "1.6.8.4 requires LLM_VISION_MODEL in the container");

  const canonicalDocument = { version: "1", pages: [{ pageNumber: 1, nativeText: "invoice ".repeat(50), nativeCharCount: 400, nativeWordCount: 50, ocrText: "", ocrWordCount: 0 }], analysis: {} } as unknown as CanonicalDocument;
  const base: any = {
    pdfPath: "/tmp/fake.pdf", canonicalDocument,
    segments: [{ segmentId: "seg-1", pageNumbers: [1] }],
    classifications: [{ segmentId: "seg-1", documentType: ClassifiedDocumentType.PACKING_LIST, confidence: 0.99, method: "TEST", evidence: [] }],
    candidateEnvelope: { version: "1", segments: [{ segmentId: "seg-1", documentType: ClassifiedDocumentType.PACKING_LIST, status: "SKIPPED", pageNumbers: [1] }] },
    forceInvoiceExecution: true, visionModelIdentity: "qwen-fail-closed-test",
    renderVisionPage: async () => ({ pageNumber: 1, mimeType: "image/png", bytes: Buffer.from([0]) })
  };

  await assert.rejects(
    () => fuseInvoiceVisionIntoWorkerCandidates({ ...base, visionProvider: { name: "qwen-fail-closed-test", extractInvoice: async () => { throw new Error("synthetic qwen runtime failure"); } } } as any),
    /LLM_VISION_PRIMARY_REQUIRED: page 1: synthetic qwen runtime failure/,
    "zero successful Qwen artifacts must fail the LLM-primary worker path"
  );

  let artifacts = 0;
  const parsed: any = { version: "1", decision: "EXTRACTED", fields: [{ field: "invoiceNumber", value: "INV-1684", confidence: 0.99, evidence: [{ source: "PAGE_IMAGE", pageNumber: 1, quote: "INV-1684" }] }], issues: [] };
  const out: any = await fuseInvoiceVisionIntoWorkerCandidates({ ...base,
    visionProvider: { name: "qwen-fail-closed-test", extractInvoice: async (request: any) => ({ ...parsed, model: "qwen-fail-closed-test", provider: "qwen-fail-closed-test", extractionArtifact: { version: "1", provider: "qwen-fail-closed-test", model: "qwen-fail-closed-test", skillVersion: "invoice-extraction-v2", documentId: request.documentId, evidenceMode: request.evidenceMode, requestedFields: request.requestedFields, pageNumbers: [1], rawModelResponse: "{}", parsedSemanticResponse: parsed } }) },
    persistModelExtractionArtifact: async () => { artifacts++; }
  } as any);
  assert.equal(artifacts, 1);
  assert.equal(out.segments[0].data.fieldCandidates.fields.invoiceNo[0].value, "INV-1684");

  console.log(JSON.stringify({ event: "product-e2e-1.6.8.4.llm-primary-fail-closed.passed", zeroArtifactCannotComplete: true, runtimeFailureSurfaced: true, partialRecoveryContractPreserved: true, supplierSpecificRules: false, directNormalizedWrite: false }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
