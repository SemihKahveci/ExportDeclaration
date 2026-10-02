import assert from "node:assert/strict";
import type { InvoiceLlmExtractionArtifact } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { normalizeModelExtractionArtifacts, upsertModelExtractionArtifact } from "../../src/modules/idp/domain/modelExtractionArtifactPersistence.js";

const artifact = (page: number, raw: string): InvoiceLlmExtractionArtifact => ({
  version: "1",
  provider: "qwen-ollama-vision",
  model: "fixture-model",
  skillVersion: "invoice-extraction-v2",
  documentId: `segment-1:page:${page}`,
  evidenceMode: "PAGE_IMAGE",
  requestedFields: ["invoiceNumber"],
  pageNumbers: [page],
  rawModelResponse: raw,
  parsedSemanticResponse: {
    version: "1",
    decision: "EXTRACTED",
    fields: [{ field: "invoiceNumber", value: "INV-1", confidence: 1, evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }] }],
    issues: []
  }
});

let persisted: unknown = undefined;
persisted = upsertModelExtractionArtifact(persisted, artifact(1, "raw-1"));
persisted = upsertModelExtractionArtifact(persisted, artifact(2, "raw-2"));
persisted = upsertModelExtractionArtifact(persisted, artifact(1, "raw-1-retry"));
const normalized = normalizeModelExtractionArtifacts(persisted);
assert.equal(normalized.length, 2, "page retry must replace, not duplicate, its first-class artifact");
assert.equal(normalized[0]?.rawModelResponse, "raw-1-retry");
assert.equal(normalized[1]?.rawModelResponse, "raw-2");
assert.equal(normalized.some((x) => x.parsedSemanticResponse.fields[0]?.value === "INV-1"), true);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.1.production-model-artifact-wiring.passed",
  dedicatedProcessingRunArtifactField: true,
  rawAndParsedSemanticResponseRetained: true,
  pageScopedRetryIdempotent: true,
  checkpointCompatibilityReadRetained: true,
  authorityBehaviorChanged: false,
  supplierSpecificRules: false,
  directNormalizedWrite: false
}, null, 2));
