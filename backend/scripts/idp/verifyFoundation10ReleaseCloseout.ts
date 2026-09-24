import { spawn } from "node:child_process";

type Check = { name: string; script: string; expectedEvent: string };

const checks: Check[] = [
  { name: "foundation-6-full-regression", script: "backend/scripts/idp/verifyFoundation6Closeout.ts", expectedEvent: "foundation-6.20.closeout-regression.passed" },
  { name: "foundation-7-full-regression", script: "backend/scripts/idp/verifyFoundation7Closeout.ts", expectedEvent: "foundation-7.8.closeout-regression.passed" },
  { name: "foundation-8-full-regression", script: "backend/scripts/idp/verifyFoundation8Closeout.ts", expectedEvent: "foundation-8.8.closeout-regression.passed" },
  { name: "foundation-9-full-regression", script: "backend/scripts/idp/verifyFoundation9Closeout.ts", expectedEvent: "foundation-9.10.closeout.passed" },
  { name: "foundation-10.1-production-readiness", script: "backend/scripts/idp/verifyProductionReadinessContract.ts", expectedEvent: "foundation-10.1.production-readiness-contract.passed" },
  { name: "foundation-10.2-queue-idempotency", script: "backend/scripts/idp/verifyQueueRetryIdempotencyHardening.ts", expectedEvent: "foundation-10.2.queue-retry-idempotency-hardening.passed" },
  { name: "foundation-10.3-resource-controls", script: "backend/scripts/idp/verifyPerformanceResourceControls.ts", expectedEvent: "foundation-10.3.performance-resource-controls.passed" },
  { name: "foundation-10.4-diagnostics", script: "backend/scripts/idp/verifyObservabilityDiagnosticsRecovery.ts", expectedEvent: "foundation-10.4.observability-diagnostics-recovery.passed" },
  { name: "foundation-10.5-security-regression", script: "backend/scripts/idp/verifySecurityTenantFailureRegression.ts", expectedEvent: "foundation-10.5.security-tenant-failure-regression.passed" },
];

function run(check: Check): Promise<number> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["--import", "tsx", check.script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { const s=String(chunk); output+=s; process.stdout.write(s); });
    child.stderr.on("data", (chunk) => { const s=String(chunk); output+=s; process.stderr.write(s); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${check.name} exited with code ${code}`));
      if (!output.includes(check.expectedEvent)) {
        return reject(new Error(`${check.name} did not emit ${check.expectedEvent}`));
      }
      resolve(Date.now() - startedAt);
    });
  });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const results: Array<{ name: string; durationMs: number }> = [];
  for (const check of checks) {
    console.log(JSON.stringify({ event: "foundation-10.6.check.started", check: check.name }));
    results.push({ name: check.name, durationMs: await run(check) });
  }

  console.log(JSON.stringify({
    event: "foundation-10.6.production-release-full-regression.passed",
    status: "COMPLETED",
    checksPassed: results.length,
    checksTotal: checks.length,
    results,
    releaseGate: {
      foundation6AuthorityAndWorkerPipeline: true,
      foundation7DeclarationIntelligence: true,
      foundation8EvidenceConstrainedLocalQwen: true,
      foundation9HumanReviewAndExceptions: true,
      productionConfigurationFailClosed: true,
      queueRetryIdempotencyHardened: true,
      resourceControlsExplicit: true,
      diagnosticsTenantScopedAndReadOnly: true,
      securityTenantFailureRegression: true
    },
    guardrails: {
      foundation6AuthorityPreserved: true,
      arbitraryLlmNormalizedWrite: false,
      crossTenantLeakageObserved: false,
      diagnosticsTriggeredRetry: false
    },
    durationMs: Date.now() - startedAt
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
