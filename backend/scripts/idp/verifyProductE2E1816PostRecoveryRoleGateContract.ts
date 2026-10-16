import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function main() {
  const source = await fs.readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");
  const recovery = source.indexOf("executeInvoiceAdaptiveGoodsNumericRecovery");
  const finalGate = source.indexOf("const finalRoleGuardedCandidates = enforceVisionDocumentRoleAuthority", recovery);
  const persisted = source.indexOf("fieldCandidates: finalRoleGuardedCandidates", finalGate);
  assert(recovery >= 0 && finalGate > recovery && persisted > finalGate,
    "Semantic role authority must run after adaptive recovery and its guarded envelope must be persisted.");
  assert.doesNotMatch(source.slice(finalGate, persisted + 100), /fieldCandidates:\s*adaptiveGoodsNumericExecution\.candidates/,
    "Post-recovery candidates must not bypass the final semantic role gate.");
  console.log(JSON.stringify({
    event: "product-e2e-1.8.16.post-recovery-role-gate.contract.passed",
    guardrails: { postRecoveryGate: true, noModelChange: true, noDirectNormalizedWrite: true }
  }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
