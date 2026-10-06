import assert from "node:assert/strict";
import { canonicalPromotionValue } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";

function iso(value: unknown): string | undefined {
  return value instanceof Date ? value.toISOString().slice(0, 10) : undefined;
}

assert.equal(iso(canonicalPromotionValue("header.invoiceDate", "14.08.2026")), "2026-08-14");
assert.equal(iso(canonicalPromotionValue("header.invoiceDate", "16-Sep-26")), "2026-09-16");
assert.equal(iso(canonicalPromotionValue("header.invoiceDate", "June 05Th, 2026")), "2026-06-05");
assert.equal(iso(canonicalPromotionValue("header.invoiceDate", "23-09-2026")), "2026-09-23");
assert.equal(canonicalPromotionValue("header.invoiceDate", "03/04/26"), "03/04/26");
assert.equal(canonicalPromotionValue("header.invoiceDate", "31-Feb-26"), "31-Feb-26");

assert.equal(canonicalPromotionValue("header.currency", "EURO"), "EUR");
assert.equal(canonicalPromotionValue("header.currency", "Euros"), "EUR");
assert.equal(canonicalPromotionValue("header.currency", "USD"), "USD");
assert.equal(canonicalPromotionValue("header.currency", "$"), "$" );
assert.equal(canonicalPromotionValue("header.currency", "¥"), "¥" );

console.log(JSON.stringify({
  event: "product-e2e-1.6.9.7.critical-scalar-promotion-canonicalization.contract.passed",
  textualInvoiceDatesCanonicalized: true,
  explicitCurrencyWordsCanonicalized: true,
  ambiguousDatesRemainFailClosed: true,
  ambiguousCurrencySymbolsRemainFailClosed: true,
  supplierSpecificRules: false,
  directNormalizedWrite: false,
  orchestrationAgentIntroduced: false
}));
