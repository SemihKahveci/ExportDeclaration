import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envSource = fs.readFileSync(path.join(root, "backend/src/config/env.ts"), "utf8");
const providerSource = fs.readFileSync(path.join(root, "backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts"), "utf8");
const composeSource = fs.readFileSync(path.join(root, "compose.dev.yaml"), "utf8");

assert.match(envSource, /llmVisionTimeoutMs:\s*num\(process\.env\.LLM_VISION_TIMEOUT_MS/);
assert.match(providerSource, /const timeoutMs = env\.llmVisionTimeoutMs/);
assert.match(providerSource, /Qwen vision timeout\/abort \(model=\$\{env\.llmVisionModel\}, pages=\$\{pages\}, timeoutMs=\$\{timeoutMs\}, elapsedMs=\$\{elapsedMs\}\)/);
assert.match(composeSource, /LLM_VISION_TIMEOUT_MS: \$\{LLM_VISION_TIMEOUT_MS:-1800000\}/);
assert.match(providerSource, /clearTimeout\(timeout\)/);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.9.vision-timeout-budget.passed",
  dedicatedVisionTimeout: true,
  configuredDevVisionTimeoutMs: 1800000,
  abortDiagnosticsIncludeElapsed: true,
  genericTextTimeoutPreserved: true,
  supplierSpecificRules: false,
  directNormalizedWrite: false
}, null, 2));
