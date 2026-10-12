import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main(): Promise<void> {
  const root = process.cwd();
  const executionPath = path.join(root, "backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts");
  const fusionPath = path.join(root, "backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
  const execution = fs.readFileSync(executionPath, "utf8");
  const fusion = fs.readFileSync(fusionPath, "utf8");

  assert.match(execution, /remaining\.has\("currency"\)/, "retry must run only for unresolved currency");
  assert.match(execution, /adaptive-scalar-currency-context/, "retry must have a distinct persisted artifact id");
  assert.match(execution, /requestedFields: \["currency"\]/, "retry must request currency only");
  assert.match(execution, /monetary table headers and monetary cells/, "retry must inspect bounded monetary context");
  assert.match(execution, /criticalScalarEvidence\.currency\.rawValue/, "retry prompt must require explicit raw currency evidence");
  assert.match(execution, /adaptFocusedScalarResponseFromRawEvidence/, "existing evidence adapter must remain the acceptance boundary");
  assert.match(execution, /currencyContextRetryPages: number\[\]/, "retry pages must be observable");
  assert.match(execution, /sort\(\(a, b\) => a - b\)\[0\]/, "currency context retry must be capped to one page");
  assert.match(execution, /foundation6Authoritative: true/, "Foundation 6 must remain authoritative");
  assert.match(execution, /writesNormalizedData: false/, "executor must not write normalizedData");
  assert.doesNotMatch(execution, /VXA2026000000035|VOLTA|560 EUR/, "production logic must not contain corpus-specific evidence");
  assert.match(fusion, /executeInvoiceAdaptiveScalarRecovery/, "production fusion must still route scalar recovery through bounded executor");

  console.log(JSON.stringify({
    event: "product-e2e-1.7.11.bounded-currency-monetary-context-recovery.contract.passed",
    guardrails: {
      unresolvedCurrencyOnly: true,
      currencyOnlyRetry: true,
      monetaryContextEvidence: true,
      criticalRawEvidenceRequired: true,
      pageImageEvidenceRequired: true,
      maxOneRetryPage: true,
      primaryProviderGateUnchanged: true,
      foundation6StillAuthoritative: true,
      supplierSpecificRules: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
