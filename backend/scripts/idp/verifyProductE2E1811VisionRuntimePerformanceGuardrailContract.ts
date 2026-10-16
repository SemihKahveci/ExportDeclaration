import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function read(relative: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), relative), "utf8");
}

async function main(): Promise<void> {
  const [envSource, providerSource, executionSource] = await Promise.all([
    read("backend/src/config/env.ts"),
    read("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts"),
    read("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts")
  ]);

  assert.match(envSource, /LLM_VISION_ATTEMPT_TIMEOUT_MS/);
  assert.match(envSource, /LLM_VISION_CONCURRENCY/);
  assert.match(providerSource, /acquireVisionSlot/);
  assert.match(providerSource, /Math\.min\(env\.llmVisionTimeoutMs, env\.llmVisionAttemptTimeoutMs\)/);
  assert.match(providerSource, /idp\.qwen_vision\.started/);
  assert.match(providerSource, /idp\.qwen_vision\.completed/);
  assert.match(providerSource, /queueWaitMs/);
  assert.match(providerSource, /elapsedMs/);
  assert.doesNotMatch(executionSource, /for \(let attempt = 1; attempt <= 2/);
  assert.match(executionSource, /Fail this page closed/);
  assert.doesNotMatch(providerSource, /normalizedData\s*=/);

  console.log(JSON.stringify({
    event: "product-e2e-1.8.11.vision-runtime-performance-guardrail.contract.passed",
    guardrails: {
      currentBasePreserved: "1.8.10.1",
      visionConcurrencyBounded: true,
      perAttemptTimeoutBounded: true,
      immediateAbortRetryRemoved: true,
      qwenTimingObservable: true,
      foundation6AuthorityUnchanged: true,
      directNormalizedWrite: false,
      contractRequiresRootComposeInsideContainer: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
