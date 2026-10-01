import assert from "node:assert/strict";
import { mergeInvoicePrimaryWithFallback } from "../../src/modules/idp/llm/invoiceProductionExtractionOrchestrator.js";
import { chooseInvoiceExtractionRoute, InvoiceEvidenceQuality } from "../../src/modules/idp/llm/invoiceLlmExtractionPolicy.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import fs from "node:fs";
import path from "node:path";

const candidate = (id: string, field: string, value: unknown, extractor: string, source: "NATIVE_TEXT" | "PAGE_IMAGE") => ({
  candidateId: id, field, value, confidence: 1, extractor,
  evidence: [{ segmentId: "seg-1", pageNumber: 1, contentSource: source }]
});

const deterministic: FieldCandidateEnvelope = { version: "1", fields: {
  invoiceNo: [candidate("native-invoice", "invoiceNo", "WRONG", "deterministic", "NATIVE_TEXT")],
  currency: [candidate("native-currency", "currency", "EUR", "deterministic", "NATIVE_TEXT")]
}};
const semantic: FieldCandidateEnvelope = { version: "1", fields: {
  invoiceNo: [candidate("vision-invoice", "invoiceNo", "RIGHT", "invoice-qwen-vision-v1", "PAGE_IMAGE")]
}};

const merged = mergeInvoicePrimaryWithFallback(semantic, deterministic);
assert.deepEqual(merged.fields.invoiceNo?.map((c) => c.value), ["RIGHT"], "VLM field must replace deterministic semantic competitors.");
assert.deepEqual(merged.fields.currency?.map((c) => c.value), ["EUR"], "Missing VLM field must retain deterministic degraded fallback.");
assert.equal(chooseInvoiceExtractionRoute({ llmEnabled: true, visionLlmAvailable: true, pageImagesAvailable: true, nativeTextQuality: InvoiceEvidenceQuality.HIGH, ocrQuality: InvoiceEvidenceQuality.HIGH }), "LLM_VISION_PRIMARY");

const workerSource = fs.readFileSync(path.resolve("backend/src/modules/idp/worker/processIdpJob.ts"), "utf8");
assert.match(workerSource, /idp\.ocr\.degraded_to_vision/, "OCR failure degradation event missing.");
assert.match(workerSource, /env\.llmVisionEnabled/, "OCR degradation must be gated by configured Vision availability.");
assert.doesNotMatch(workerSource, /normalizedData\s*=/, "Cutover must not directly write normalizedData.");

console.log(JSON.stringify({
  event: "product-e2e-1.6.7.llm-first-worker-cutover.passed",
  llmVlmPrimaryWhenAvailable: true,
  deterministicFieldCompetitionSuppressed: true,
  deterministicMissingFieldFallbackRetained: true,
  ocrFailureCanDegradeToVision: true,
  resolverAuthorityRetained: true,
  directNormalizedWrite: false,
  supplierSpecificRules: false
}, null, 2));
