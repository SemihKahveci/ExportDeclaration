import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function backendPath(relativePath: string): string {
  const candidates = [path.resolve(process.cwd(), "backend", relativePath), path.resolve(process.cwd(), relativePath), path.resolve("/app/backend", relativePath)];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  throw new Error(`Backend file not found from cwd=${process.cwd()}: ${relativePath}`);
}
const read = (p: string) => fs.readFileSync(backendPath(p), "utf8");
const envSource = read("src/config/env.ts");
const fusion = read("src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const resolver = read("src/modules/idp/llm/resolveFieldCandidatesWithLlm.ts");
const provider = read("src/modules/idp/llm/qwenVisionInvoiceProvider.ts");
const skill = read("src/modules/idp/llm/invoiceExtractionSkill.ts");

assert.match(fusion, /verifiedKnowledge: \[\]/);
assert.doesNotMatch(fusion, /FOUNDATION8_PRIMARY_VISION_KNOWLEDGE|renderIdpSkillContext|loadIdpSkill/);
assert.match(envSource, /LLM_VISION_NUM_CTX, 8192/);
assert.match(envSource, /LLM_VISION_NUM_PREDICT, 4096/);
assert.match(envSource, /foundation8TextSpecialistsEnabled: bool\(process\.env\.FOUNDATION8_TEXT_SPECIALISTS_ENABLED, false\)/);
assert.match(resolver, /if \(env\.foundation8ShadowModelEnabled\) return \{ resolution: deterministic \};/);
assert.match(provider, /LLM_VISION_OUTPUT_TRUNCATED/);
for (const rule of ["TABLE ROLE BINDING", "PRODUCT IDENTITY", "EXTRACTION COVERAGE"]) assert.ok(skill.includes(rule), `shared Vision skill missing ${rule}`);

console.log({
  event: "foundation-8.25.3.pre-8.24-runtime-baseline.contract.passed",
  perPageSpecialistKnowledgeInjection: false,
  visionNumCtx: 8192,
  visionNumPredict: 4096,
  qwen3DefaultSecondPass: false,
  truncationFailClosed: true,
  semanticRulesRetainedInSharedVisionSkill: true
});
