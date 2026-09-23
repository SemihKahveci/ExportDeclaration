import { spawnSync } from "node:child_process";

const checks = [
  ["6.1", "verifyLogicalDocumentMaterialization.ts"],
  ["6.2", "verifyDeclarationDocumentSetAndAuthority.ts"],
  ["6.3", "verifyPersistedDeclarationDocumentSet.ts"],
  ["6.4", "verifyDeclarationFieldCandidateProjection.ts"],
  ["6.5", "verifyDeclarationFieldResolution.ts"],
  ["6.6", "verifyPersistedDeclarationFieldResolution.ts"],
  ["6.7", "verifyDeclarationFieldPromotion.ts"],
  ["6.8", "verifyDeclarationFieldOrchestration.ts"],
  ["6.9", "verifyDeclarationFieldLifecycle.ts"],
  ["6.10", "verifyProcessingRunCandidatePersistence.ts"],
  ["6.11", "verifyWorkerCandidateLifecycleIntegration.ts"],
  ["6.12", "verifyProcessingRunDocumentOwnership.ts"],
  ["6.13", "verifyRealDigitalWorkerE2E.ts"],
  ["6.14", "verifyRealDigitalGoodsLinePromotion.ts"],
  ["6.15", "verifyBullMqWorkerE2E.ts"],
  ["6.16", "verifyBullMqRetryRecoveryE2E.ts"],
  ["6.17", "verifyBullMqConcurrencyIsolationE2E.ts"],
  ["6.18", "verifyRealScannedWorkerE2E.ts"],
  ["6.19", "verifyMixedCheckpointReplayE2E.ts"],
] as const;

const passed: string[] = [];
const startedAt = Date.now();

for (const [foundation, script] of checks) {
  console.log(JSON.stringify({
    event: "foundation-6.closeout.check.started",
    foundation,
    script,
  }));

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", `backend/scripts/idp/${script}`],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Foundation ${foundation} regression failed: ${script} exited with ${result.status}`);
  }

  passed.push(foundation);
  console.log(JSON.stringify({
    event: "foundation-6.closeout.check.passed",
    foundation,
    script,
  }));
}

console.log(JSON.stringify({
  event: "foundation-6.20.closeout-regression.passed",
  foundation: "6",
  status: "COMPLETED",
  regression: {
    expectedChecks: checks.length,
    passedChecks: passed.length,
    foundations: passed,
  },
  boundaries: {
    digitalWorkerE2E: true,
    bullMqTransport: true,
    retryRecovery: true,
    concurrencyIsolation: true,
    scannedPaddleOcrE2E: true,
    mixedCheckpointReplay: true,
  },
  durationMs: Date.now() - startedAt,
}));
