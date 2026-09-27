import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_FIELDS, INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { chooseInvoiceExtractionRoute, InvoiceEvidenceQuality, InvoiceExtractionRoute } from "../../src/modules/idp/llm/invoiceLlmExtractionPolicy.js";

assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v1");
assert.ok(INVOICE_EXTRACTION_FIELDS.includes("goodsLines[].hsCode"));
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /PAGE_IMAGE evidence is primary evidence/);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /VERIFIED knowledge is retrieval guidance, not authority/);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /do not write directly to final normalized declaration data/i);

assert.equal(chooseInvoiceExtractionRoute({
  llmEnabled: true, visionLlmAvailable: true, pageImagesAvailable: true,
  nativeTextQuality: InvoiceEvidenceQuality.UNAVAILABLE, ocrQuality: InvoiceEvidenceQuality.LOW
}), InvoiceExtractionRoute.LLM_VISION_PRIMARY);

assert.equal(chooseInvoiceExtractionRoute({
  llmEnabled: true, visionLlmAvailable: false, pageImagesAvailable: true,
  nativeTextQuality: InvoiceEvidenceQuality.HIGH, ocrQuality: InvoiceEvidenceQuality.UNAVAILABLE
}), InvoiceExtractionRoute.HYBRID_TEXT);

assert.equal(chooseInvoiceExtractionRoute({
  llmEnabled: true, visionLlmAvailable: false, pageImagesAvailable: true,
  nativeTextQuality: InvoiceEvidenceQuality.UNAVAILABLE, ocrQuality: InvoiceEvidenceQuality.MEDIUM
}), InvoiceExtractionRoute.HYBRID_PARALLEL);

assert.equal(chooseInvoiceExtractionRoute({
  llmEnabled: false, visionLlmAvailable: true, pageImagesAvailable: true,
  nativeTextQuality: InvoiceEvidenceQuality.UNAVAILABLE, ocrQuality: InvoiceEvidenceQuality.UNAVAILABLE
}), InvoiceExtractionRoute.REVIEW_REQUIRED);

console.log(JSON.stringify({
  event: "product-e2e-1.1.first-class-llm-contract.passed",
  skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
  visionPrimaryWhenOcrWeak: true,
  llmPeerPathWhenTextAvailable: true,
  verifiedKnowledgeIsNonAuthoritative: true,
  foundation6AuthorityPreserved: true
}, null, 2));
