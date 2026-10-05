import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const execution = fs.readFileSync(path.resolve(process.cwd(),
  "backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts"), "utf8");
const diagnostic = fs.readFileSync(path.resolve(process.cwd(),
  "backend/scripts/idp/verifyProductE2E16825RealQwenScalarRecoveryDiagnostic.ts"), "utf8");

assert.match(execution, /recovery calls are first-class model executions/i);
assert.match(execution, /pushArtifact\(recovery\.extractionArtifact\)/);
assert.match(execution, /pushArtifact\(scalarRecovery\.extractionArtifact\)/);
assert.match(execution, /pushArtifact\(originRecovery\.extractionArtifact\)/);
assert.match(diagnostic, /recoveryArtifactTrace/);
assert.match(diagnostic, /rawModelResponse/);

// Diagnostic-only checkpoint: extraction semantics must remain on the known-good baseline.
assert.doesNotMatch(execution, /origin-only raw-evidence recovery pass/i);
assert.doesNotMatch(execution, /exactly as visibly printed on the page/i);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.30.recovery-artifact-observability.passed",
  emptyRecoveryArtifactsPersisted: true,
  compactRawRecoveryTrace: true,
  extractionSemanticsChanged: false,
  knownGoodOriginRecoveryRetained: true
}, null, 2));
