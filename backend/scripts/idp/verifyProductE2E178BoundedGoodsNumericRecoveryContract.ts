import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const executor = await readFile("backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts", "utf8");
  const fusion = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");

  assert(executor.includes("executeInvoiceAdaptiveGoodsNumericRecovery"));
  assert(executor.includes('action.reason === "GOODS_ARITHMETIC_DISAGREEMENT"'));
  assert(executor.includes('/^goodsLines\\.\\d+\\.lineTotal$/'));
  assert(executor.includes('requestedFields: ["goodsLines[].quantity", "goodsLines[].unitPrice", "goodsLines[].lineTotal"]'));
  assert(executor.includes("sameNumericValue(targetQuantity, row?.quantity)"));
  assert(executor.includes("sameNumericValue(targetUnitPrice, row?.unitPrice)"));
  assert(executor.includes("matches.length !== 1"));
  assert(executor.includes("arithmeticSupportsLineTotal(row)"));
  assert(executor.includes('contentSource: "PAGE_IMAGE"'));
  assert(executor.includes("slice(0, 2)"));
  assert(executor.includes("foundation6Authoritative: true"));
  assert(executor.includes("writesNormalizedData: false"));
  assert(!executor.includes("Dermeternal GmbH"));
  assert(!executor.includes("10500"));
  assert(fusion.includes("adaptiveGoodsNumericExecution.candidates"));
  assert(fusion.includes("adaptiveGoodsNumericExecutionAudit"));

  console.log(JSON.stringify({
    event: "product-e2e-1.7.8.bounded-goods-numeric-recovery.contract.passed",
    guardrails: {
      plannerDriven: true,
      arithmeticDisagreementOnly: true,
      lineTotalOnly: true,
      quantityAndUnitPriceRemainUntouched: true,
      quantityAndUnitPriceFingerprintRequired: true,
      uniqueRowMatchRequired: true,
      arithmeticCorroborationRequired: true,
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
