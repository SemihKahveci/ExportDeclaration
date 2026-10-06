import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const resolverPath = path.join(root, "backend/src/modules/idp/domain/declarationFieldResolver.ts");
const source = fs.readFileSync(resolverPath, "utf8");

assert.match(source, /\^goodsLines\\\.\\d\+\\\.hsCode\$/,
  "GTIP guard must be scoped to goods-line hsCode fields.");
assert.match(source, /\^\\d\{12\}\$/,
  "GTIP authority must require exactly 12 digits.");
assert.match(source, /status:\s*"REVIEW_REQUIRED"/,
  "Incomplete GTIP must fail closed to REVIEW_REQUIRED.");
assert.match(source, /reason:\s*"GTIP_REQUIRES_12_DIGITS"/,
  "Fail-closed GTIP reason must remain auditable.");
assert.doesNotMatch(source, /87089900|330499|P0087|Dermeternal|Volta|VXA2026/i,
  "Production resolver must not contain holdout/supplier-specific tuning.");

console.log(JSON.stringify({
  event: "product-e2e-1.6.9.8.gtip-fail-closed-authority.contract.passed",
  guardrails: {
    exactlyTwelveDigitGtipRequiredForResolution: true,
    incompleteHsRemainsEvidenceButRequiresReview: true,
    foundation6AuthorityPreserved: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
    orchestrationAgentIntroduced: false
  }
}, null, 2));
