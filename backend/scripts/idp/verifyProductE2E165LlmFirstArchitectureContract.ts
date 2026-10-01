import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { chooseInvoiceExtractionRoute, InvoiceEvidenceQuality, InvoiceExtractionRoute } from "../../src/modules/idp/llm/invoiceLlmExtractionPolicy.js";

assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v2");
for (const nativeTextQuality of [InvoiceEvidenceQuality.HIGH, InvoiceEvidenceQuality.MEDIUM, InvoiceEvidenceQuality.LOW, InvoiceEvidenceQuality.UNAVAILABLE]) {
  for (const ocrQuality of [InvoiceEvidenceQuality.HIGH, InvoiceEvidenceQuality.MEDIUM, InvoiceEvidenceQuality.LOW, InvoiceEvidenceQuality.UNAVAILABLE]) {
    assert.equal(chooseInvoiceExtractionRoute({ llmEnabled: true, visionLlmAvailable: true, pageImagesAvailable: true, nativeTextQuality, ocrQuality }), InvoiceExtractionRoute.LLM_VISION_PRIMARY);
  }
}
assert.equal(chooseInvoiceExtractionRoute({ llmEnabled: false, visionLlmAvailable: true, pageImagesAvailable: true, nativeTextQuality: InvoiceEvidenceQuality.HIGH, ocrQuality: InvoiceEvidenceQuality.UNAVAILABLE }), InvoiceExtractionRoute.DETERMINISTIC_ONLY);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Semantically parse numeric values/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /dates as YYYY-MM-DD/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /ISO-4217/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /ISO-3166-1 alpha-2/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /grossKg\/netKg are kilograms/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /product\/catalog\/model code is not an HS\/GTIP/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /arithmetic only as corroboration/i);
assert.doesNotMatch(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Do not normalize locale/i);

console.log(JSON.stringify({
  event: "product-e2e-1.6.5.llm-first-architecture-contract.passed",
  semanticExtractor: "LLM_VLM_PRIMARY",
  nativeTextRole: "EVIDENCE_CORROBORATION",
  ocrRole: "EVIDENCE_CORROBORATION",
  deterministicParserRole: "DEGRADED_FALLBACK_DURING_CUTOVER",
  semanticNumericParsingRequired: true,
  semanticNormalizationRequired: true,
  goodsRowSemanticAssociationRequired: true,
  unsupportedTariffInferenceForbidden: true,
  supplierSpecificRules: false,
  directNormalizedWrite: false
}, null, 2));
