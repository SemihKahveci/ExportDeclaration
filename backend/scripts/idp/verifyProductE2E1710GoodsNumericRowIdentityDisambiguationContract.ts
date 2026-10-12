import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main(): Promise<void> {
  const root = process.cwd();
  const source = await readFile(path.join(root, "backend/src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.ts"), "utf8");

  assert.match(source, /numericMatches = rawRows\.filter/);
  assert.match(source, /if \(matches\.length > 1\)/);
  assert.match(source, /goodsLines\.\$\{index\}\.description/);
  assert.match(source, /normalizeGoodsRowIdentityText/);
  assert.match(source, /normalizeGoodsRowIdentityText\(row\?\.description\) === normalizedTargetDescription/);
  assert.match(source, /if \(matches\.length !== 1\) continue/);
  assert.match(source, /arithmeticSupportsLineTotal\(row\)/);
  assert.match(source, /InvoiceLlmEvidenceMode\.PAGE_IMAGE/);
  assert.match(source, /\.slice\(0, 2\)/);
  assert.match(source, /foundation6Authoritative: true/);
  assert.match(source, /writesNormalizedData: false/);
  assert.doesNotMatch(source, /Dermeternal GmbH/);
  assert.doesNotMatch(source, /10'500\.00/);
  assert.doesNotMatch(source, /2026\/0001/);

  console.log(JSON.stringify({
    event: "product-e2e-1.7.10.goods-numeric-row-identity-disambiguation.contract.passed",
    guardrails: {
      numericFingerprintRemainsPrimary: true,
      descriptionUsedOnlyForAmbiguousNumericMatches: true,
      uniqueDescriptionMatchRequired: true,
      arithmeticCorroborationStillRequired: true,
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
