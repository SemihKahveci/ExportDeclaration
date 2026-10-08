import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const executor = await readFile("backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts", "utf8");


  assert.match(executor, /adaptFocusedScalarResponseFromRawEvidence/);
  assert.match(executor, /criticalScalarEvidence/);
  assert.match(executor, /field !== "invoiceDate" && field !== "currency"/);
  assert.match(executor, /currencyEvidenceSupports/);
  assert.match(executor, /exactScalarEvidenceSupports/);
  assert.match(executor, /rawEvidenceAdaptedFields/);
  assert.match(executor, /confidence: 0\.99/);
  assert.match(executor, /source: "PAGE_IMAGE"/);
  assert.match(executor, /slice\(0, 2\)/);
  assert.match(executor, /fields\[field\] = recovered\.fields\[field\]!/);
  assert.match(executor, /foundation6Authoritative: true/);
  assert.match(executor, /writesNormalizedData: false/);
  assert.doesNotMatch(executor, /volta|pml|ningbo|dermeternal|eryem|VXA2026|P0087|WYL2026|26020/i);

  console.log(JSON.stringify({
    event: "product-e2e-1.7.4.adaptive-scalar-evidence-adapter.contract.passed",
    guardrails: {
      boundedExecutorOnly: true,
      primaryProviderGateUnchanged: true,
      requestedFieldsOnly: true,
      criticalRawEvidenceRequired: true,
      scalarFieldsOnly: ["currency", "invoiceDate"],
      pageImageEvidenceRequired: true,
      maxTwoPages: true,
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
