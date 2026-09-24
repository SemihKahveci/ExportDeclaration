import { spawnSync } from "node:child_process";
import path from "node:path";

const checks = [
  ["8.1", "verifyDeclarationLlmAssistContract.ts", "foundation-8.1.declaration-llm-assist-contract.passed"],
  ["8.2", "verifyDeclarationQwenProviderIntegration.ts", "foundation-8.2.declaration-qwen-provider-integration.passed"],
  ["8.3", "verifyDeclarationLlmAssistOrchestration.ts", "foundation-8.3.declaration-llm-assist-orchestration.passed"],
  ["8.4", "verifyDeclarationLlmAuthorityBridge.ts", "foundation-8.4.llm-candidate-authority-bridge.passed"],
  ["8.5", "verifyWorkerLlmAssistLifecycleIntegration.ts", "foundation-8.5.worker-llm-assist-lifecycle-integration.passed"],
  ["8.6", "verifyQwenRuntimeReadiness.ts", "foundation-8.6.qwen-runtime-readiness.passed"],
  ["8.7", "verifyRealLocalQwenE2E.ts", "foundation-8.7.real-local-qwen-e2e.passed"],
] as const;

function runCheck(foundation: string, script: string, expectedEvent: string) {
  const scriptPath = path.resolve(process.cwd(), "backend/scripts/idp", script);
  process.stdout.write(`\n=== Foundation ${foundation}: ${script} ===\n`);

  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Foundation ${foundation} verifier failed with exit code ${String(result.status)}.`);
  }
  if (!result.stdout.includes(expectedEvent)) {
    throw new Error(`Foundation ${foundation} verifier did not emit expected event ${expectedEvent}.`);
  }
  return { foundation, script, event: expectedEvent, passed: true };
}

function main() {
  const results = checks.map(([foundation, script, event]) => runCheck(foundation, script, event));

  console.log(JSON.stringify({
    event: "foundation-8.8.closeout-regression.passed",
    foundation: 8,
    status: "COMPLETED",
    expectedChecks: checks.length,
    passedChecks: results.length,
    foundations: results.map((result) => result.foundation),
    boundaries: {
      evidenceConstrainedContract: true,
      openAiCompatibleQwenProvider: true,
      appendOnlyAssistAudit: true,
      foundation6AuthorityBridgePreserved: true,
      productionWorkerLifecycleIntegrated: true,
      runtimeReadinessFailClosed: true,
      realLocalQwenE2E: true,
      directLlmNormalizedWrite: false,
      arbitraryReplacementValueAccepted: false,
      mockRuntimeUsedForFinalE2E: false,
    },
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
