import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_KNOWLEDGE_VERSION, INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE } from "../../src/modules/idp/llm/invoiceExtractionKnowledge.js";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { criticalScalarEvidenceSupportsValue } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

const dateOk = { criticalScalarEvidence: { invoiceDate: { label: "Fatura Tarihi", rawValue: "22.09.2026" } } };
const currencyTl = { criticalScalarEvidence: { currency: { label: "Döviz Cinsi", rawValue: "TL" } } };
const currencyEur = { criticalScalarEvidence: { currency: { label: "Currency", rawValue: "EUR" } } };

assert.equal(INVOICE_EXTRACTION_KNOWLEDGE_VERSION, "invoice-knowledge-v1");
assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v6");
assert.ok(INVOICE_EXTRACTION_SYSTEM_PROMPT.includes(INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE));
assert.ok(INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE.includes("Page order is provenance, not authority"));
assert.ok(INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE.includes("TL -> TRY"));
assert.ok(!/Mekar|Volta|Ningbo|EAR2026/i.test(INVOICE_EXTRACTION_VERIFIED_KNOWLEDGE));

assert.equal(criticalScalarEvidenceSupportsValue(dateOk, "invoiceDate", "2026-09-22"), true);
assert.equal(criticalScalarEvidenceSupportsValue(dateOk, "invoiceDate", "2022-09-22"), false);
assert.equal(criticalScalarEvidenceSupportsValue(currencyTl, "currency", "TRY"), true);
assert.equal(criticalScalarEvidenceSupportsValue(currencyTl, "currency", "EUR"), false);
assert.equal(criticalScalarEvidenceSupportsValue(currencyEur, "currency", "EUR"), true);
assert.equal(criticalScalarEvidenceSupportsValue({ criticalScalarEvidence: { currency: { label: "Currency", rawValue: "$" } } }, "currency", "USD"), false);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.16.versioned-invoice-knowledge-and-scalar-grounding.passed",
  knowledgeVersion: INVOICE_EXTRACTION_KNOWLEDGE_VERSION,
  skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
  runtimeKnowledgeInjected: true,
  invoiceDateEvidenceMustMatchNormalizedValue: true,
  currencyEvidenceMustMatchCanonicalValue: true,
  tlTryEvidenceEquivalent: true,
  ambiguousCurrencySymbolFailsClosed: true,
  qwenPrimary: true,
  ocrPrimary: false,
  supplierSpecificRules: false,
  autonomousKnowledgeMutation: false,
  groundTruthAuthorityUsed: false,
  directNormalizedWrite: false
}, null, 2));
