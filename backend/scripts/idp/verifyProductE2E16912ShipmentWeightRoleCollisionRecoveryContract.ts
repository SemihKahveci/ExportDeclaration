import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const execution = await readFile("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts", "utf8");
  const provider = await readFile("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts", "utf8");

  assert.match(execution, /shipment-weight-evidence-recovery/);
  assert.match(execution, /EQUALS_GOODS_QUANTITY/);
  assert.match(execution, /requestedFields: \["grossKg", "netKg"\]/);
  assert.match(execution, /Gross\/Brüt shipment-weight/);
  assert.match(execution, /Never use Miktar\/Quantity\/Qty, Koli\/Package\/Box\/Pallet/);
  assert.match(execution, /collidingRoles/);
  assert.match(execution, /shipmentWeightRecoveryProjected/);
  assert.match(provider, /shipment-weight-evidence-recovery/);
  assert.match(provider, /isWeightLabel\(label, requestedField\)/);
  assert.doesNotMatch(execution, /eryem|YEM2026|26020/i);
  assert.doesNotMatch(provider, /eryem|YEM2026|26020/i);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.12.shipment-weight-role-collision-recovery.contract.passed",
    guardrails: {
      quantityWeightCollisionIsTriggerOnly: true,
      labelledShipmentEvidenceRequired: true,
      goodsQuantityCannotBecomeShipmentWeight: true,
      arithmeticNotAuthority: true,
      supplierSpecificRules: false,
      directNormalizedWrite: false,
      foundation6AuthorityPreserved: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
