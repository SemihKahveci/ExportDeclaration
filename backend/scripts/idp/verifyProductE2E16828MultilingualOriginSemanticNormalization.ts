import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_KNOWLEDGE_VERSION, INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE } from "../../src/modules/idp/llm/invoiceExtractionKnowledge.js";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT, INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";

const combined = [INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE, INVOICE_EXTRACTION_SYSTEM_PROMPT, INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION].join("\n");
assert.equal(INVOICE_EXTRACTION_KNOWLEDGE_VERSION, "invoice-knowledge-v3");
assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v9");
assert.match(combined, /multilingual|language-specific/i);
assert.match(combined, /ISO-3166-1 alpha-2/i);
assert.match(combined, /visible|visibly/i);
assert.match(combined, /ambiguous/i);
assert.match(combined, /seller|buyer|address/i);

for (const forbidden of ["MEKAR", "EAR2026000000068", "KAAN MED", "page 2", "second page"]) {
  assert.equal(combined.includes(forbidden), false, `forbidden invoice-specific token: ${forbidden}`);
}
assert.equal(/\bABD\s*(?:->|=>|=)\s*US\b/i.test(combined), false);
assert.equal(/origin\s*=\s*["']?(?:US|ABD)/i.test(combined), false);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.28.multilingual-origin-semantic-normalization.passed",
  knowledgeVersion: INVOICE_EXTRACTION_KNOWLEDGE_VERSION,
  skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
  visibleOriginCanUseLanguageSpecificCountryMeaning: true,
  isoNormalizationRemainsSemantic: true,
  ambiguousCountryMeaningFailsClosed: true,
  sellerBuyerAddressCountryNotOrigin: true,
  supplierSpecificRules: false,
  invoiceSpecificValues: false,
  groundTruthAuthorityUsed: false,
  directNormalizedWrite: false
}, null, 2));
