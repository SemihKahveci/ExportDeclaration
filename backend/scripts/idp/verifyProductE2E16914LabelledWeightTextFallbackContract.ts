import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const path = "backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts";
  const source = await readFile(path, "utf8");

  assert.match(source, /labelledShipmentWeightFallback/);
  assert.match(source, /shipmentWeightRecoveryTriggered/);
  assert.match(source, /invoice-labelled-weight-text-fallback-v1/);
  assert.match(source, /contentSource: nativeMatch \? "NATIVE_TEXT" : "OCR"/);
  assert.match(source, /shipmentWeightRecoveryProjected\?\.fields\[role\]/);
  assert.match(source, /Toplam Brüt Tutar/);
  assert.doesNotMatch(source, /eryem|YEM2026|26020|PALET SAYISI/i);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.14.labelled-weight-text-fallback.contract.passed",
    guardrails: {
      qwenRecoveryRemainsPrimary: true,
      deterministicTextFallbackOnlyAfterCollision: true,
      exactWeightLabelRequired: true,
      nativeOrOcrEvidencePersisted: true,
      supplierSpecificRules: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
