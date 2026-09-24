import { spawnSync } from "node:child_process";

type Check = { name: string; script: string; expected: string };

const checks: Check[] = [
  { name: "9.1 human review contract", script: "verifyDeclarationHumanReviewContract.ts", expected: "foundation-9.1.human-review-domain-contract.passed" },
  { name: "9.2 human review persistence", script: "verifyDeclarationHumanReviewPersistence.ts", expected: "foundation-9.2.human-review-persistence.passed" },
  { name: "9.3 human authority bridge", script: "verifyDeclarationHumanReviewAuthorityBridge.ts", expected: "foundation-9.3.human-review-authority-bridge.passed" },
  { name: "9.4 human review API", script: "verifyDeclarationHumanReviewApi.ts", expected: "foundation-9.4.human-review-api.passed" },
  { name: "9.6 exception contract", script: "verifyDeclarationExceptionAssessment.ts", expected: "foundation-9.6.confidence-exception-contract.passed" },
  { name: "9.7 exception persistence", script: "verifyDeclarationExceptionPersistence.ts", expected: "foundation-9.7.exception-persistence.passed" },
  { name: "9.8 worker exception lifecycle", script: "verifyWorkerExceptionLifecycleIntegration.ts", expected: "foundation-9.8.worker-exception-lifecycle.passed" },
  { name: "9.9 exception API/UI boundary", script: "verifyDeclarationExceptionApi.ts", expected: "foundation-9.9.exception-api-ui-boundary.passed" },
  // Re-run the real multi-document declaration boundary because Foundation 9
  // review/exception state is downstream of this exact F6/F7 source topology.
  { name: "real multi-document declaration regression", script: "verifyRealMultiDocumentDeclarationE2E.ts", expected: "foundation-7.7.real-multi-document-declaration-e2e.passed" },
];

const results: Array<{ name: string; passed: boolean; expected: string }> = [];

for (const check of checks) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", `backend/scripts/idp/${check.script}`],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  const passed = result.status === 0 && output.includes(check.expected);
  results.push({ name: check.name, passed, expected: check.expected });

  if (!passed) {
    console.error(JSON.stringify({
      event: "foundation-9.10.closeout.failed",
      failedCheck: check.name,
      expectedEvent: check.expected,
      exitCode: result.status,
    }, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify({
  event: "foundation-9.10.closeout.passed",
  checks: results,
  summary: {
    checksPassed: results.filter((item) => item.passed).length,
    checksTotal: results.length,
    humanReviewContractRegression: true,
    humanReviewPersistenceRegression: true,
    humanAuthorityBridgeRegression: true,
    humanReviewApiRegression: true,
    exceptionContractRegression: true,
    exceptionPersistenceRegression: true,
    productionWorkerExceptionLifecycleRegression: true,
    exceptionApiUiBoundaryRegression: true,
    realMultiDocumentDeclarationRegression: true,
  },
  guardrails: {
    foundation6RemainsAuthorityBoundary: true,
    exceptionLayerDoesNotCreateAuthority: true,
    noImplicitConfidenceThreshold: true,
    appendOnlyReviewAndExceptionAuditRetained: true,
    tenantScopeFailClosed: true,
  },
}, null, 2));
