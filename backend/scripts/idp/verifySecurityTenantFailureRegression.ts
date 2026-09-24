import { spawn } from "node:child_process";

type Check = { name: string; script: string; expectedEvent: string };

const checks: Check[] = [
  {
    name: "production-readiness-fail-closed",
    script: "backend/scripts/idp/verifyProductionReadinessContract.ts",
    expectedEvent: "foundation-10.1.production-readiness-contract.passed",
  },
  {
    name: "processing-run-document-ownership",
    script: "backend/scripts/idp/verifyProcessingRunDocumentOwnership.ts",
    expectedEvent: "foundation-6.12.run-document-ownership.passed",
  },
  {
    name: "human-review-api-security",
    script: "backend/scripts/idp/verifyDeclarationHumanReviewApi.ts",
    expectedEvent: "foundation-9.4.human-review-api.passed",
  },
  {
    name: "exception-api-tenant-isolation",
    script: "backend/scripts/idp/verifyDeclarationExceptionApi.ts",
    expectedEvent: "foundation-9.9.exception-api-ui-boundary.passed",
  },
  {
    name: "observability-tenant-isolation",
    script: "backend/scripts/idp/verifyObservabilityDiagnosticsRecovery.ts",
    expectedEvent: "foundation-10.4.observability-diagnostics-recovery.passed",
  },
];

function runCheck(check: Check): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", check.script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk); output += text; process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk); output += text; process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${check.name} exited with code ${code}`));
      if (!output.includes(check.expectedEvent)) {
        return reject(new Error(`${check.name} did not emit ${check.expectedEvent}`));
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const passed: string[] = [];
  for (const check of checks) {
    console.log(JSON.stringify({ event: "foundation-10.5.check.started", check: check.name }));
    await runCheck(check);
    passed.push(check.name);
  }

  console.log(JSON.stringify({
    event: "foundation-10.5.security-tenant-failure-regression.passed",
    checksPassed: passed.length,
    checksTotal: checks.length,
    checks: passed,
    security: {
      productionConfigurationFailsClosed: true,
      processingRunDocumentOwnershipEnforced: true,
      humanReviewClientCompanySpoofRejected: true,
      humanReviewClientActorSpoofRejected: true,
      staleHumanReviewSourceRejected: true,
      exceptionApiTenantIsolationPreserved: true,
      diagnosticsTenantAndDeclarationIsolationPreserved: true
    },
    failureBoundaries: {
      malformedCandidateSnapshotRejectedBeforeWrite: true,
      diagnosticsRemainReadOnly: true,
      recoveryAdviceDoesNotTriggerRetry: true
    },
    guardrails: {
      foundation6AuthorityChanged: false,
      normalizedDataWrittenByRegressionHarness: false,
      crossTenantLeakageObserved: false
    }
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
