import assert from "node:assert/strict";
import {
  normalizeCriticalScalarEvidenceCurrency,
  normalizeCriticalScalarEvidenceDate,
  criticalScalarEvidenceSupportsValue,
} from "../../src/modules/idp/llm/qwenVisionInvoiceProvider";

assert.equal(normalizeCriticalScalarEvidenceDate("14.08.2026"), "2026-08-14");
assert.equal(normalizeCriticalScalarEvidenceDate("2026-08-14"), "2026-08-14");
assert.equal(normalizeCriticalScalarEvidenceDate("16-Sep-26"), "2026-09-16");
assert.equal(normalizeCriticalScalarEvidenceDate("June 05Th,2026"), "2026-06-05");
assert.equal(normalizeCriticalScalarEvidenceCurrency("EURO 21'000.00"), "EUR");
assert.equal(normalizeCriticalScalarEvidenceCurrency("Total EUR"), "EUR");
assert.equal(normalizeCriticalScalarEvidenceCurrency("$"), undefined);
assert.equal(normalizeCriticalScalarEvidenceCurrency("¥"), undefined);

const dateParsed = {
  invoiceDate: "14.08.2026",
  criticalScalarEvidence: { invoiceDate: { label: "Invoice date", rawValue: "14.08.2026" } },
};
assert.equal(criticalScalarEvidenceSupportsValue(dateParsed as never, "invoiceDate", "14.08.2026"), true);
assert.equal(criticalScalarEvidenceSupportsValue(dateParsed as never, "invoiceDate", "2026-08-14"), true);
assert.equal(criticalScalarEvidenceSupportsValue(dateParsed as never, "invoiceDate", "2026-08-15"), false);

const ordinalDateParsed = {
  invoiceDate: "June 05Th,2026",
  criticalScalarEvidence: { invoiceDate: { label: "Invoice date", rawValue: "June 05Th,2026" } },
};
assert.equal(criticalScalarEvidenceSupportsValue(ordinalDateParsed as never, "invoiceDate", "June 05Th,2026"), true);

const currencyParsed = {
  currency: "EUR",
  criticalScalarEvidence: { currency: { label: "Total EUR", rawValue: "EURO 21'000.00" } },
};
assert.equal(criticalScalarEvidenceSupportsValue(currencyParsed as never, "currency", "EUR"), true);
assert.equal(criticalScalarEvidenceSupportsValue(currencyParsed as never, "currency", "USD"), false);

console.log(JSON.stringify({
  event: "product-e2e-1.6.9.6.critical-scalar-semantic-evidence.contract.passed",
  semanticNormalizationBothSides: true,
  ordinalDateEvidence: true,
  explicitCurrencyWordEvidence: true,
  ambiguousCurrencySymbolsRemainFailClosed: true,
  supplierSpecificRules: false,
  directNormalizedWrite: false,
  orchestrationAgentIntroduced: false,
}));
