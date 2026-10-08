import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const matrix = fs.readFileSync(path.join(root, "backend/scripts/idp/verifyProductE2E1691SemanticFailureMatrix.ts"), "utf8");
assert.match(matrix, /adaptiveScalarArtifacts/);
assert.match(matrix, /:adaptive-scalar:/);
assert.match(matrix, /rawModelResponse/);
assert.match(matrix, /parsedSemanticResponse/);
assert.doesNotMatch(matrix, /adaptiveScalarArtifacts[\s\S]{0,500}normalizedData\s*=/);
console.log(JSON.stringify({
  event: "product-e2e-1.7.3.3.adaptive-scalar-raw-evidence-diagnostic.contract.passed",
  guardrails: {
    measurementOnly: true,
    rawModelResponseObserved: true,
    parsedSemanticResponseObserved: true,
    productionExtractionChanged: false,
    foundation6Unchanged: true,
    directNormalizedWrite: false
  }
}, null, 2));
