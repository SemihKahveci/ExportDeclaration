import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function backendPath(relativePath: string): string {
  const candidates = [
    path.resolve(process.cwd(), "backend", relativePath),
    path.resolve(process.cwd(), relativePath),
    path.resolve("/app/backend", relativePath)
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error(`Backend file not found from cwd=${process.cwd()}: ${relativePath}`);
}
function readBackend(relativePath: string): string { return fs.readFileSync(backendPath(relativePath), "utf8"); }

const envSource = readBackend("src/config/env.ts");
const fusionSource = readBackend("src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const resolverSource = readBackend("src/modules/idp/llm/resolveFieldCandidatesWithLlm.ts");
const textSource = readBackend("src/modules/idp/llm/qwenTextInvoiceProvider.ts");
const specialistSource = readBackend("src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.ts");

assert.match(envSource, /foundation8TextSpecialistsEnabled: bool\(process\.env\.FOUNDATION8_TEXT_SPECIALISTS_ENABLED, false\)/);
assert.match(fusionSource, /verifiedKnowledge: \[\]/);
assert.doesNotMatch(fusionSource, /FOUNDATION8_PRIMARY_VISION_KNOWLEDGE/);
assert.match(resolverSource, /if \(env\.foundation8ShadowModelEnabled\) return \{ resolution: deterministic \};/);
assert.match(textSource, /attempt <= 1/);
assert.match(specialistSource, /isFoundation8TransportFailure/);
assert.match(specialistSource, /failedTargetPages\.push\(chunk\.targetPageNumber\);\s*continue;/);

console.log({
  event: "foundation-8.25.single-semantic-lane.contract.passed",
  primaryVisionExtraSkillCorpus: false,
  textSpecialistsDefaultEnabled: false,
  legacyFieldLlmInFoundation8: false,
  transportRetryBudget: 0
});
