import assert from "node:assert/strict";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";

assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v4");

const matrix = [
  { id: "order-date-before-invoice-date", guard: /Do not use order, delivery, shipment, due, payment, print, dispatch/i },
  { id: "invoice-date-on-later-page", guard: /invoice\/document issue date may be extracted from any page/i },
  { id: "page-one-is-not-authority", guard: /Never prefer a date merely because it appears on page 1/i },
  { id: "continuation-bare-date", guard: /bare or role-ambiguous date on a continuation\/secondary page is not enough evidence/i },
  { id: "multiple-dates-require-role", guard: /multiple dates[\s\S]*visible label\/context identifies the invoice\/document issue-date role/i },
  { id: "ambiguous-multiple-dates-fail-closed", guard: /return invoiceDate as null rather than choosing the first, nearest or only convenient date/i },
];

for (const scenario of matrix) assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, scenario.guard, scenario.id);
assert.doesNotMatch(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Mekar|Volta|Ningbo|EAR2026000000068|VXA-0035|WYL-2026060501/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /Never guess/i);
assert.match(INVOICE_EXTRACTION_SYSTEM_PROMPT, /If a value is ambiguous or unsupported, leave it null rather than inventing it/i);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.14.invoice-date-generalization-guard-matrix.passed",
  skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
  scenarios: matrix.map(({ id }) => id),
  pageOrderAuthority: false,
  explicitRoleMayAppearOnAnyPage: true,
  ambiguousRoleFailsClosed: true,
  groundTruthAuthorityUsed: false,
  supplierSpecificRules: false,
  directNormalizedWrite: false
}, null, 2));
