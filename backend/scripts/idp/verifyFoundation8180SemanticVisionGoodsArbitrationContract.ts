import assert from "node:assert/strict";
import fs from "node:fs";

const orchestration = fs.readFileSync("backend/src/modules/idp/domain/declarationFieldOrchestration.service.ts", "utf8");
const provider = fs.readFileSync("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts", "utf8");
const fusion = fs.readFileSync("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");

const acceptance = {
  visionGoodsIdentityCanRemainSemanticPrimary:
    orchestration.includes('candidate.extractor === "invoice-qwen-vision-v1"') &&
    orchestration.includes('/^goodsLines\\.\\d+\\.(productCode|description)$/'),
  nativeRowCannotBlindlyOverrideSemanticVision:
    orchestration.includes("semanticVisionAuthorityFields.has(field)"),
  singleRowNumericVisionNeedsArithmeticCorroboration:
    orchestration.includes("approximatelyEqual(q * p, a)"),
  singleRowNumericVisionNeedsDocumentTotalCorroboration:
    orchestration.includes("totalCorroborated") && orchestration.includes("candidates.fields.totalAmount"),
  arithmeticDoesNotManufactureGoodsValues:
    !orchestration.includes("total / p") && !orchestration.includes("a / p"),
  specialistUsesStructuredOutputSchema:
    provider.includes("specialistStructuredOutputSchema()") && provider.includes('required: ["version", "decision", "fields"]'),
  specialistContractExplicitlyForbidsDomainNativeShape:
    provider.includes("Do not return domain-native goodsLines/parties objects"),
  f6StillOwnsFinalWritePath:
    fusion.includes("overlayReconciledFoundation8Candidates") && !fusion.includes("normalizedData =")
};
for (const [name, ok] of Object.entries(acceptance)) assert.equal(ok, true, name);

const runtime = orchestration + provider + fusion;
const guardrails = {
  supplierSpecificRules: /CELIKEL|VED2026|YEM2026|VOLTA|NINGBO|DERMETERNAL|P0087/i.test(runtime),
  goldenCorpusImportedAtRuntime: /goldenCorpus|golden\/foundation8/i.test(runtime),
  shortHsFabricatedToGtip: /padStart\(12|padEnd\(12/.test(runtime),
  arithmeticManufacturesValues: /total\s*\/\s*(?:unitPrice|price)|lineTotal\s*\/\s*(?:unitPrice|price)/.test(runtime)
};
assert.equal(guardrails.supplierSpecificRules, false);
assert.equal(guardrails.goldenCorpusImportedAtRuntime, false);
assert.equal(guardrails.shortHsFabricatedToGtip, false);
assert.equal(guardrails.arithmeticManufacturesValues, false);

console.log(JSON.stringify({
  event: "foundation-8.18.semantic-vision-goods-arbitration.contract.passed",
  acceptance,
  guardrails
}, null, 2));
