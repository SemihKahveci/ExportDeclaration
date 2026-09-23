import { spawnSync } from "node:child_process";

const checks = [
  ["7.1", "verifyDeclarationDocumentCoverage.ts"],
  ["7.2", "verifyDeclarationCrossDocumentConsistency.ts"],
  ["7.3", "verifyDeclarationIntelligenceReadiness.ts"],
  ["7.4", "verifyPersistedDeclarationIntelligenceAssessment.ts"],
  ["7.5", "verifyDeclarationIntelligenceOrchestration.ts"],
  ["7.6", "verifyWorkerIntelligenceLifecycleIntegration.ts"],
  ["7.7", "verifyRealMultiDocumentDeclarationE2E.ts"],
] as const;

const passed: string[] = [];
const startedAt = Date.now();

for (const [foundation, script] of checks) {
  console.log(JSON.stringify({
    event: "foundation-7.closeout.check.started",
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

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Foundation ${foundation} regression failed: ${script} exited with ${result.status}`);
  }

  passed.push(foundation);
  console.log(JSON.stringify({
    event: "foundation-7.closeout.check.passed",
    foundation,
    script,
  }));
}

console.log(JSON.stringify({
  event: "foundation-7.8.closeout-regression.passed",
  foundation: "7",
  status: "COMPLETED",
  regression: {
    expectedChecks: checks.length,
    passedChecks: passed.length,
    foundations: passed,
  },
  boundaries: {
    explicitCoveragePolicy: true,
    explicitConsistencyPolicy: true,
    readinessComposition: true,
    appendOnlyAssessmentAudit: true,
    persistedProductionOrchestration: true,
    workerLifecycleIntegration: true,
    realMultiDocumentE2E: true,
    foundation6AuthorityPreserved: true,
    normalizedDataOwnershipPreserved: true,
    syntheticCandidateInjection: false,
  },
  durationMs: Date.now() - startedAt,
}));
