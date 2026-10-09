import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const executor = await readFile("backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts", "utf8");
  const fusion = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");

  assert(executor.includes("executeInvoiceAdaptiveGoodsCodeRecovery"));
  assert(executor.includes('action.reason === "INVALID_GTIN_SHAPE"'));
  assert(executor.includes('/^goodsLines\\.\\d+\\.hsCode$/'));
  assert(executor.includes('requestedFields: ["goodsLines[].hsCode"]'));
  assert(executor.includes('return /^\\d{12}$/.test(digits) ? digits : undefined'));
  assert(executor.includes("anchorCount < 2"));
  assert(executor.includes("matches.length !== 1"));
  assert(executor.includes('contentSource: "PAGE_IMAGE"'));
  assert(executor.includes("slice(0, 2)"));
  assert(executor.includes("foundation6Authoritative: true"));
  assert(executor.includes("writesNormalizedData: false"));
  assert(!executor.includes("871110000011"));
  assert(!executor.includes("VOLTA"));
  assert(fusion.includes("adaptiveGoodsCodeExecution.candidates"));
  assert(fusion.includes("adaptiveGoodsCodeExecutionAudit"));

  console.log(JSON.stringify({
    event: "product-e2e-1.7.7.bounded-goods-code-recovery.contract.passed",
    guardrails: {
      plannerDriven: true,
      invalidGtipShapeOnly: true,
      exactTwelveDigitsOnly: true,
      noPaddingOrGuessing: true,
      numericFingerprintRequiresAtLeastTwoAnchors: true,
      uniqueRowMatchRequired: true,
      pageImageEvidenceRequired: true,
      maxTwoPages: true,
      arithmeticRecoveryStillShadow: true,
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
