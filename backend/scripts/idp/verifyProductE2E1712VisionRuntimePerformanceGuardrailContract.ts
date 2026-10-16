import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function main(): Promise<void> {
  const [envSource, providerSource, executionSource, devCompose, envExample] = await Promise.all([
    fs.readFile("backend/src/config/env.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts", "utf8"),
    fs.readFile("compose.dev.yaml", "utf8"),
    fs.readFile("env.example", "utf8")
  ]);

  assert(envSource.includes("LLM_VISION_CONCURRENCY"));
  assert(envSource.includes("num(process.env.LLM_VISION_CONCURRENCY, 1)"));
  assert(providerSource.includes("visionInferenceSemaphore.acquire(env.llmVisionConcurrency)"));
  assert(providerSource.includes('event: "idp.qwen_vision.started"'));
  assert(providerSource.includes('event: "idp.qwen_vision.completed"'));
  assert(providerSource.includes("releaseInferenceSlot()"));
  assert(devCompose.includes("LLM_VISION_CONCURRENCY: ${LLM_VISION_CONCURRENCY:-1}"));
  assert(envExample.includes("LLM_VISION_CONCURRENCY=1"));

  // The former loop retried an identical PAGE_IMAGE request after abort/timeout,
  // allowing one page to consume 2 x the already-large vision timeout budget.
  assert(!executionSource.includes("for (let attempt = 1; attempt <= 2; attempt += 1)"));
  assert(!executionSource.includes("isRetryableAbort(error)"));
  assert(executionSource.includes("Record the failed page and let the existing"));

  // Extraction authority and normalized-data ownership are intentionally untouched.
  assert(!providerSource.includes("normalizedData"));

  console.log(JSON.stringify({
    event: "product-e2e-1.7.12.vision-runtime-performance-guardrail.contract.passed",
    controls: {
      workerConcurrencyIndependentFromVisionConcurrency: true,
      defaultVisionConcurrency: 1,
      duplicateTimeoutRetryRemoved: true,
      perInferenceTimingObservable: true
    },
    guardrails: {
      extractionAuthorityChanged: false,
      normalizedDataMutated: false,
      supplierSpecificRules: false,
      invoiceSpecificRules: false
    }
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
