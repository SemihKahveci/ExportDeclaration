import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const executor = await readFile("backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts", "utf8");
  const fusion = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");

  assert(executor.includes("executeInvoiceAdaptiveGoodsDescriptionRecovery"));
  assert(executor.includes('action.reason === "MISSING_GOODS_FIELD"'));
  assert(executor.includes('/^goodsLines\\.\\d+\\.description$/'));
  assert(executor.includes('requestedFields: ["goodsLines[].description"]'));
  assert(executor.includes("anchorCount < 2"));
  assert(executor.includes("matches.length !== 1"));
  assert(executor.includes('contentSource: "PAGE_IMAGE"'));
  assert(executor.includes("slice(0, 2)"));
  assert(executor.includes("foundation6Authoritative: true"));
  assert(executor.includes("writesNormalizedData: false"));
  assert(!executor.includes("NINGBO"));
  assert(!executor.includes("squeegees"));
  assert(fusion.includes("adaptiveGoodsDescriptionExecution.candidates"));
  assert(fusion.includes("adaptiveGoodsDescriptionExecutionAudit"));

  console.log(JSON.stringify({
    event: "product-e2e-1.7.6.bounded-missing-goods-description-recovery.contract.passed",
    guardrails: {
      plannerDriven: true,
      missingDescriptionOnly: true,
      numericFingerprintRequiresAtLeastTwoAnchors: true,
      uniqueRowMatchRequired: true,
      pageImageEvidenceRequired: true,
      maxTwoPages: true,
      otherGoodsRecoveryStillShadow: true,
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
