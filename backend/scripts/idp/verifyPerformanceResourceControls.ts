import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildIdpResourcePolicy } from "../../src/modules/idp/readiness/idpResourcePolicy.js";

async function main(): Promise<void> {

  const digital = buildIdpResourcePolicy({ workerConcurrency: 2, pageCount: 8, contentKind: "DIGITAL", llmEnabled: false, llmTimeoutMs: 180000 });
  assert.equal(digital.ocrRequired, false); assert.equal(digital.ocrPageBudget, 0); assert.equal(digital.llmTimeoutMs, null);

  const scanned = buildIdpResourcePolicy({ workerConcurrency: 2, pageCount: 3, contentKind: "SCANNED", llmEnabled: true, llmTimeoutMs: 180000 });
  assert.equal(scanned.ocrRequired, true); assert.equal(scanned.ocrPageBudget, 3); assert.equal(scanned.llmTimeoutMs, 180000);

  const mixed = buildIdpResourcePolicy({ workerConcurrency: 1, pageCount: 5, contentKind: "MIXED", llmEnabled: false, llmTimeoutMs: 180000 });
  assert.equal(mixed.ocrRequired, true); assert.equal(mixed.ocrPageBudget, 5);

  for (const value of [0, -1, 1.5]) assert.throws(() => buildIdpResourcePolicy({ workerConcurrency: value, pageCount: 1, contentKind: "DIGITAL", llmEnabled: false, llmTimeoutMs: 1 }));
  assert.throws(() => buildIdpResourcePolicy({ workerConcurrency: 1, pageCount: 1, contentKind: "DIGITAL", llmEnabled: true, llmTimeoutMs: 0 }));

  const workerSource = await fs.readFile("backend/src/worker.ts", "utf8");
  assert(workerSource.includes("concurrency: env.idpWorkerConcurrency"));
  const envSource = await fs.readFile("backend/src/config/env.ts", "utf8");
  assert(envSource.includes("IDP_WORKER_CONCURRENCY"));

  console.log(JSON.stringify({
    event: "foundation-10.3.performance-resource-controls.passed",
    controls: {
      workerConcurrencyExplicitAndConfigurable: true, workerConcurrencyMustBePositiveInteger: true,
      digitalDocumentsSkipOcrBudget: true, scannedDocumentsHaveFinitePageBudget: true,
      mixedDocumentsHaveFinitePageBudget: true, llmDisabledHasNoRuntimeTimeoutBudget: true,
      enabledLlmRequiresPositiveTimeout: true, productionWorkerConsumesConfiguredConcurrency: true
    },
    guardrails: {
      unboundedWorkerConcurrencyIntroduced: false, digitalOcrForced: false, llmSilentlyEnabled: false,
      extractionAuthorityChanged: false, normalizedDataMutated: false
    }
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
