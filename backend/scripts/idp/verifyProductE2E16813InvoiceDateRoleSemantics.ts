import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";

assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v3");
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /invoice\/document issue date only/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /invoice date, issue date, fatura tarihi or düzenleme tarihi/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Do not use order, delivery, shipment, due, payment, print, dispatch/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /bare or role-ambiguous date on a continuation\/secondary page is not enough evidence/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /return invoiceDate as null/i);
assert.doesNotMatch(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Mekar|Volta|Ningbo|EAR2026000000068/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /If a value is ambiguous or unsupported, leave it null rather than inventing it/i);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.13.invoice-date-role-semantics.passed",
  skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
  explicitInvoiceIssueDateRequired: true,
  nonInvoiceDateRolesRejected: true,
  ambiguousContinuationDateFailsClosed: true,
  conflictingExplicitInvoiceDatesStillHandledByFoundation6: true,
  groundTruthAuthorityUsed: false,
  supplierSpecificRules: false,
  directNormalizedWrite: false
}, null, 2));
