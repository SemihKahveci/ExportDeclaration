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
const providerSource = readBackend("src/modules/idp/llm/qwenVisionInvoiceProvider.ts");

assert.match(envSource, /LLM_VISION_NUM_CTX, 8192/);
assert.match(envSource, /LLM_VISION_NUM_PREDICT, 4096/);
assert.match(providerSource, /num_ctx: env\.llmVisionNumCtx/);
assert.match(providerSource, /num_predict: env\.llmVisionNumPredict/);
assert.match(providerSource, /payload\.done_reason === "length"/);
assert.match(providerSource, /LLM_VISION_OUTPUT_TRUNCATED/);

console.log({
  event: "foundation-8.25.1.vision-output-budget.passed",
  defaultNumCtx: 8192,
  defaultNumPredict: 4096,
  truncationClassified: true,
  executionSurface: "backend-container-safe"
});
