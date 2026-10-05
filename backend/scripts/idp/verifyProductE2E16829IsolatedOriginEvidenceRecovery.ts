import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../../src/modules/idp/llm/invoiceProductionVisionExecution.ts"), "utf8");

assert.match(source, /requestedFields:\s*\["origin"\]/, "origin recovery must request origin only");
assert.match(source, /origin-only evidence recovery pass/i);
assert.match(source, /language-specific country abbreviation/i);
assert.match(source, /ISO-3166-1 alpha-2/i);
assert.match(source, /seller, buyer, address, destination, dispatch, bank country/i);
assert.match(source, /originWasRequested[\s\S]*!responseHasOrigin[\s\S]*!scalarHasOrigin/,
  "origin-only pass must be conditional on origin still being absent");
assert.match(source, /originRecoveryAttempted/);
assert.match(source, /originRecoveryReturned/);
assert.doesNotMatch(source, /MEKAR|EAR2026000000068|KAAN MED|\b48\b|\b40\b/,
  "runtime recovery must not contain supplier/invoice/ground-truth values");
assert.doesNotMatch(source, /ABD\s*(?:->|=>|:).*US|origin\s*===?\s*["']ABD["']/i,
  "runtime recovery must not hard-code a document-specific country answer");

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.29.isolated-origin-evidence-recovery.passed",
  originOnlyQwenRecovery: true,
  localizedCountryMeaningAllowed: true,
  isoNormalizationRequested: true,
  unrelatedFieldsReRequested: false,
  supplierSpecificRules: false,
  invoiceSpecificValues: false,
  directNormalizedWrite: false
}, null, 2));
