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
const visionSource = readBackend("src/modules/idp/llm/qwenVisionInvoiceProvider.ts");
const textSource = readBackend("src/modules/idp/llm/qwenTextInvoiceProvider.ts");
const extractionSkillSource = readBackend("src/modules/idp/llm/invoiceExtractionSkill.ts");

assert.match(envSource, /foundation8TextSpecialistsEnabled: bool\(process\.env\.FOUNDATION8_TEXT_SPECIALISTS_ENABLED, false\)/);
assert.match(envSource, /LLM_VISION_NUM_CTX, 8192/);
assert.match(envSource, /LLM_VISION_NUM_PREDICT, 4096/);
assert.match(fusionSource, /verifiedKnowledge: \[\]/);
assert.doesNotMatch(fusionSource, /FOUNDATION8_PRIMARY_VISION_KNOWLEDGE/);
assert.match(resolverSource, /if \(env\.foundation8ShadowModelEnabled\) return \{ resolution: deterministic \};/);
assert.match(visionSource, /num_ctx: env\.llmVisionNumCtx/);
assert.match(visionSource, /num_predict: env\.llmVisionNumPredict/);
assert.match(visionSource, /payload\.done_reason === "length"/);
assert.match(visionSource, /LLM_VISION_OUTPUT_TRUNCATED/);
assert.match(textSource, /attempt <= 1/);
assert.match(extractionSkillSource, /TABLE ROLE BINDING/);
assert.match(extractionSkillSource, /PRODUCT IDENTITY/);
assert.match(extractionSkillSource, /EXTRACTION COVERAGE/);

const corpusLeakPattern = /(?:66\s+PALET|25\.000|17\.500|FOB\s+NINGBO|1250\s+Koli|25000|17500|31081(?:[.,]10)?|53[.,]3268|4M717|9900A|\b4835\b)/i;
for (const root of [backendPath("src"), backendPath("idp-skills")]) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(?:ts|md|json)$/i.test(entry.name)) {
        assert.doesNotMatch(fs.readFileSync(full, "utf8"), corpusLeakPattern, `corpus-specific literal leaked into runtime/skills: ${full}`);
      }
    }
  }
}

console.log({
  event: "foundation-8.25.2.batch-readiness.contract.passed",
  semanticLane: "qwen-vl-primary",
  fullSkillCorpusInjectedPerPage: false,
  textSpecialistsDefaultEnabled: false,
  legacyFieldLlmInFoundation8: false,
  visionBudget: { numCtx: 8192, numPredict: 4096 },
  visionTruncationFailClosed: true,
  corpusSpecificRuntimeKnowledge: false,
  executionSurface: "backend-container-safe"
});
