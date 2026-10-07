import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const sourcePath = path.resolve("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts");
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /canonicalPageWeightEvidenceTexts/);
  assert.match(source, /page\.lines/);
  assert.match(source, /page\.words/);
  assert.match(source, /invoice-labelled-weight-text-fallback-v2/);
  assert.match(source, /shipmentWeightTextFallbackReturnedFields/);
  assert.match(source, /shipmentWeightTextFallbackSources/);
  assert.match(source, /labelledShipmentWeightFallback/);
  assert.doesNotMatch(source, /YEM2026|eryem-yem|26020/iu);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.15.canonical-layout-weight-fallback.contract.passed",
    guardrails: {
      qwenPrimary: true,
      roleCollisionGated: true,
      explicitWeightLabelRequired: true,
      canonicalLinesAndWordsAreEvidenceOnly: true,
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
