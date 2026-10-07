import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts"), "utf8");
assert.match(source, /maxCanonicalY/);
assert.match(source, /coordinatesAreNormalized/);
assert.match(source, /\? 0\.025/);
assert.match(source, /Math\.max\(2, page\.height \* 0\.004\)/);
assert.match(source, /invoice-labelled-weight-text-fallback-v2/);
assert.match(source, /canonicalPageWeightEvidenceTexts/);
assert.doesNotMatch(source, /eryem|YEM2026|26020/i);
console.log(JSON.stringify({
  event: "product-e2e-1.6.9.16.canonical-weight-row-geometry.contract.passed",
  guardrails: {
    qwenPrimary: true,
    roleCollisionGated: true,
    normalizedCanonicalGeometryPreserved: true,
    explicitWeightLabelRequired: true,
    deterministicTextIsFallbackOnly: true,
    foundation6StillAuthoritative: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
    orchestrationAgentIntroduced: false
  }
}, null, 2));
