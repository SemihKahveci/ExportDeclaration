import assert from "node:assert/strict";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { fuseInvoiceVisionIntoWorkerCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

async function main() {
  const { env } = await import("../../src/config/env.js");
  assert.equal(env.llmEnabled, true, "1.6.8.3 requires LLM_ENABLED=true in the container");
  assert.equal(env.llmVisionEnabled, true, "1.6.8.3 requires LLM_VISION_ENABLED=true in the container");
  assert.ok(env.llmVisionModel.trim(), "1.6.8.3 requires LLM_VISION_MODEL in the container");

  const canonicalDocument = {
    version: "1",
    pages: [{ pageNumber: 1, nativeText: "commercial invoice ".repeat(40), nativeCharCount: 760, nativeWordCount: 80, ocrText: "", ocrWordCount: 0 }],
    analysis: {}
  } as unknown as CanonicalDocument;
  const parsed: any = {
    version: "1", decision: "EXTRACTED",
    fields: [{ field: "invoiceNumber", value: "INV-RUNTIME-1683", confidence: 0.99, evidence: [{ source: "PAGE_IMAGE", pageNumber: 1, quote: "INV-RUNTIME-1683" }] }],
    issues: []
  };
  let providerCalls = 0;
  let artifacts = 0;
  const provider: any = {
    name: "qwen-runtime-authority-test",
    extractInvoice: async (request: any) => {
      providerCalls++;
      return {
        ...parsed, model: "qwen-runtime-authority-test", provider: "qwen-runtime-authority-test",
        extractionArtifact: {
          version: "1", provider: "qwen-runtime-authority-test", model: "qwen-runtime-authority-test",
          skillVersion: "invoice-extraction-v2", documentId: request.documentId,
          evidenceMode: request.evidenceMode, requestedFields: request.requestedFields,
          pageNumbers: [1], rawModelResponse: '{"invoiceNumber":"INV-RUNTIME-1683"}', parsedSemanticResponse: parsed
        }
      };
    }
  };

  // Deliberately simulate a confident wrong segment classification. The worker
  // already knows the uploaded document is INVOICE and therefore passes
  // forceInvoiceExecution=true; classifier disagreement must not bypass Qwen.
  const envelope: any = {
    version: "1",
    segments: [{ segmentId: "seg-1", documentType: ClassifiedDocumentType.PACKING_LIST, status: "SKIPPED", pageNumbers: [1], reason: "misclassified" }]
  };
  const out: any = await fuseInvoiceVisionIntoWorkerCandidates({
    pdfPath: "/tmp/fake.pdf",
    canonicalDocument,
    segments: [{ segmentId: "seg-1", pageNumbers: [1] }] as any,
    classifications: [{ segmentId: "seg-1", documentType: ClassifiedDocumentType.PACKING_LIST, confidence: 0.99, method: "TEST", evidence: [] }] as any,
    candidateEnvelope: envelope,
    forceInvoiceExecution: true,
    visionProvider: provider,
    visionModelIdentity: "qwen-runtime-authority-test",
    renderVisionPage: async () => ({ pageNumber: 1, mimeType: "image/png", bytes: Buffer.from([0]) }),
    persistModelExtractionArtifact: async () => { artifacts++; }
  } as any);

  assert.equal(providerCalls, 1, "uploaded INVOICE authority must invoke Qwen despite classifier disagreement");
  assert.equal(artifacts, 1, "successful Qwen page extraction must persist a first-class artifact");
  assert.equal(out.segments[0].data.fieldCandidates.fields.invoiceNo[0].value, "INV-RUNTIME-1683");

  // Guardrail: the same classifier result without uploaded-INVOICE authority
  // must not be coerced into invoice execution.
  providerCalls = 0;
  artifacts = 0;
  await fuseInvoiceVisionIntoWorkerCandidates({
    pdfPath: "/tmp/fake.pdf",
    canonicalDocument,
    segments: [{ segmentId: "seg-1", pageNumbers: [1] }] as any,
    classifications: [{ segmentId: "seg-1", documentType: ClassifiedDocumentType.PACKING_LIST, confidence: 0.99, method: "TEST", evidence: [] }] as any,
    candidateEnvelope: { version: "1", segments: [{ segmentId: "seg-1", documentType: ClassifiedDocumentType.PACKING_LIST, status: "SKIPPED", pageNumbers: [1] }] } as any,
    forceInvoiceExecution: false,
    visionProvider: provider,
    visionModelIdentity: "qwen-runtime-authority-test",
    renderVisionPage: async () => ({ pageNumber: 1, mimeType: "image/png", bytes: Buffer.from([0]) }),
    persistModelExtractionArtifact: async () => { artifacts++; }
  } as any);
  assert.equal(providerCalls, 0, "non-INVOICE worker path must retain classifier routing");
  assert.equal(artifacts, 0);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.8.3.runtime-invoice-authority.passed",
    uploadedInvoiceAuthorityOverridesSegmentMisclassification: true,
    qwenInvocationRequired: true,
    modelArtifactPersistenceRequired: true,
    nonInvoiceWorkerGuardrailPreserved: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
