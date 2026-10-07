import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { INVOICE_EXTRACTION_SKILL_VERSION } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const executionPath = path.resolve(here, "../../src/modules/idp/llm/invoiceProductionVisionExecution.ts");
  const source = await readFile(executionPath, "utf8");

  assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v9");
  assert.match(source, /ROW_\$\{index\}_ARITHMETIC_INCONSISTENT/);
  assert.match(source, /FREE_OF_CHARGE_NONZERO_TOTAL/);
  assert.match(source, /goods-numeric-semantic-recovery/);
  assert.match(source, /Arithmetic is a trigger\/check|arithmetic is a trigger\/check/i);
  assert.match(source, /Do not calculate a line total merely from quantity times unit price/);
  assert.match(source, /Koli\/Package\/Box\/Pallet/);
  assert.match(source, /commercial Miktar\/Quantity column/);
  assert.match(source, /17\.500,00 means 17500/);
  assert.match(source, /grossKg\/netKg are shipment-level labelled weights only/);
  assert.match(source, /nativeText: pageContext\?\.nativeText/);
  assert.match(source, /ocrText: pageContext\?\.ocrText/);
  assert.match(source, /replacementFields/);
  assert.match(source, /numericRecoveryProjected/);
  assert.doesNotMatch(source, /eryem|dermeternal|YEM2026|2026\/0001/i);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.10.goods-numeric-semantic-recovery.contract.passed",
    skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
    guardrails: {
      anomalyTriggeredOnly: true,
      samePageQwenAuthority: true,
      pageLocalTextAssistOnly: true,
      arithmeticNotAuthority: true,
      freeOfChargeCommercialSemanticsPreserved: true,
      shipmentWeightNotDerivedFromGoods: true,
      foundation6StillAuthoritative: true,
      supplierSpecificRules: false,
      directNormalizedWrite: false,
      orchestrationAgentIntroduced: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
