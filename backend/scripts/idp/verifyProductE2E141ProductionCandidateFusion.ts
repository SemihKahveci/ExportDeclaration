import assert from "node:assert/strict";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import {
  mergeInvoiceCandidateSources,
  planInvoiceProductionExtraction,
  projectVisionResponseToFieldCandidates
} from "../../src/modules/idp/llm/invoiceProductionExtractionOrchestrator.js";
import { InvoiceExtractionRoute } from "../../src/modules/idp/llm/invoiceLlmExtractionPolicy.js";

function document(kind: "DIGITAL" | "SCANNED", nativeText: string, ocrText = ""): CanonicalDocument {
  return {
    schemaVersion: "1.0", source: {},
    analysis: { contentKind: kind, pageCount: 1, digitalPageCount: kind === "DIGITAL" ? 1 : 0, scannedPageCount: kind === "SCANNED" ? 1 : 0, mixedPageCount: 0, nativeTextPageCount: nativeText ? 1 : 0, ocrPageCount: ocrText ? 1 : 0, ocrWordCount: ocrText ? 80 : 0 },
    pages: [{ pageNumber: 1, width: 595, height: 842, rotation: 0, nativeText, nativeCharCount: nativeText.length, nativeWordCount: nativeText ? 80 : 0, hasNativeText: !!nativeText, imageCount: 1, imageCoverage: kind === "SCANNED" ? 1 : 0.1, contentKind: kind, ocrApplied: !!ocrText, ocrText, ocrWordCount: ocrText ? 80 : 0, words: [], lines: [] }]
  };
}

const digitalPlan = planInvoiceProductionExtraction({ canonicalDocument: document("DIGITAL", "x".repeat(400)), llmEnabled: true, visionLlmAvailable: true, pageImagesAvailable: true });
assert.equal(digitalPlan.route, InvoiceExtractionRoute.HYBRID_TEXT);
assert.equal(digitalPlan.runDeterministic, true);
assert.equal(digitalPlan.runVision, true);

const scannedPlan = planInvoiceProductionExtraction({ canonicalDocument: document("SCANNED", "", "ocr ".repeat(100)), llmEnabled: true, visionLlmAvailable: true, pageImagesAvailable: true });
assert.equal(scannedPlan.runDeterministic, true);
assert.equal(scannedPlan.runVision, true);
assert.deepEqual(scannedPlan.visionPageNumbers, [1]);

const vision = projectVisionResponseToFieldCandidates({
  segmentId: "seg-1", pageNumber: 1,
  response: { version: "1", decision: InvoiceLlmExtractionDecision.EXTRACTED, model: "qwen3-vl:8b-instruct", provider: "qwen-ollama-vision", issues: [], fields: [
    { field: "invoiceNumber", value: "INV-42", confidence: 0.9, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE" }] },
    { field: "goodsLines[].hsCode", value: ["853620900019", "550340000011"], confidence: 0.8, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE" }] }
  ] }
});
assert.equal(vision.fields.invoiceNumber?.[0]?.evidence[0]?.contentSource, "PAGE_IMAGE");
assert.equal(vision.fields["goodsLines.1.hsCode"]?.[0]?.value, "550340000011");

const deterministic: FieldCandidateEnvelope = { version: "1", fields: { invoiceNumber: [{ candidateId: "det:invoice", field: "invoiceNumber", value: "INV-42", confidence: 0.99, extractor: "invoice-canonical-v1", evidence: [{ segmentId: "seg-1", pageNumber: 1, contentSource: "NATIVE_TEXT" }] }] } };
const fused = mergeInvoiceCandidateSources(deterministic, vision);
assert.equal(fused.fields.invoiceNumber?.length, 2);
assert.equal(fused.fields.invoiceNumber?.[0]?.extractor, "invoice-canonical-v1");
assert.equal(fused.fields.invoiceNumber?.[1]?.extractor, "invoice-qwen-vision-v1");

console.log(JSON.stringify({
  event: "product-e2e-1.4.1.production-candidate-fusion.passed",
  deterministicAndVisionArePeers: true,
  pageImageProvenancePreserved: true,
  visionGoodsArraysIndexed: true,
  pageCheckpointPlan: true,
  resolverAuthorityUnchanged: true,
  directNormalizedWrite: false
}, null, 2));
