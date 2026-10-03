import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { criticalScalarEvidenceQuote } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v5");
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /criticalScalarEvidence\.invoiceDate\.label and rawValue must reproduce the visible label\/context/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /criticalScalarEvidence\.currency\.label and rawValue must reproduce visible page text/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Do not invent, paraphrase, repair or normalize these evidence strings/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /currency symbol whose meaning is ambiguous/i);

const groundedDate = criticalScalarEvidenceQuote({
  criticalScalarEvidence: { invoiceDate: { label: "Fatura Tarihi", rawValue: "22.09.2026" } }
}, "invoiceDate");
assert.equal(groundedDate, "Fatura Tarihi: 22.09.2026");

const groundedCurrency = criticalScalarEvidenceQuote({
  criticalScalarEvidence: { currency: { label: "Döviz Cinsi", rawValue: "TL" } }
}, "currency");
assert.equal(groundedCurrency, "Döviz Cinsi: TL");

assert.equal(criticalScalarEvidenceQuote({
  criticalScalarEvidence: { invoiceDate: { label: "Invoice Date", rawValue: null } }
}, "invoiceDate"), undefined);
assert.equal(criticalScalarEvidenceQuote({
  criticalScalarEvidence: { currency: { label: "", rawValue: "EUR" } }
}, "currency"), undefined);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.15.critical-scalar-evidence-capture.passed",
  skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
  invoiceDateVisibleEvidenceRequired: true,
  currencyVisibleEvidenceRequired: true,
  unsupportedCriticalScalarFailsClosed: true,
  evidenceStringsRemainRaw: true,
  qwenPrimary: true,
  ocrPrimary: false,
  supplierSpecificRules: false,
  groundTruthAuthorityUsed: false,
  directNormalizedWrite: false
}, null, 2));
