import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const executor = await readFile("backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts", "utf8");
  const fusion = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");

assert.match(executor, /mode: "BOUNDED_EXECUTION"/);
assert.match(executor, /action\.tool === InvoiceRecoveryTool\.SCALAR_EVIDENCE/);
assert.match(executor, /invoiceNo: "invoiceNumber"/);
assert.match(executor, /invoiceDate: "invoiceDate"/);
assert.match(executor, /currency: "currency"/);
assert.match(executor, /slice\(0, 2\)/);
assert.match(executor, /evidenceMode: InvoiceLlmEvidenceMode\.PAGE_IMAGE/);
assert.match(executor, /If uncertain, omit the field/);
assert.match(executor, /fields\[field\] = recovered\.fields\[field\]!/);
assert.match(executor, /foundation6Authoritative: true/);
assert.match(executor, /writesNormalizedData: false/);
assert.doesNotMatch(executor, /volta|pml|ningbo|dermeternal|eryem|VXA2026|P0087|WYL2026|26020/i);
assert.match(fusion, /executeInvoiceAdaptiveScalarRecovery/);
assert.match(fusion, /fieldCandidates: adaptiveRecoveryExecution\.candidates/);
assert.match(fusion, /adaptiveRecoveryExecutionAudit: adaptiveRecoveryExecution\.audit/);

console.log(JSON.stringify({
  event: "product-e2e-1.7.3.bounded-scalar-recovery-execution.contract.passed",
  guardrails: {
    plannerDriven: true,
    scalarEvidenceOnly: true,
    pageImageEvidenceRequired: true,
    maxTwoPages: true,
    recoveredFieldReplacementOnly: true,
    goodsRecoveryStillShadow: true,
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
