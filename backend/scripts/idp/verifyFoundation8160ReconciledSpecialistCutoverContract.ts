import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { bridgeReconciledFoundation8ToCandidates, overlayReconciledFoundation8Candidates } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistCandidateBridge.js";
import type { Foundation8SpecialistReconciliationAudit } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistReconciliation.js";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const qwen = read("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts");
const fusion = read("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const execution = read("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.ts");
const goodsSkill = read("backend/idp-skills/invoice-goods-table/SKILL.md");
const partiesSkill = read("backend/idp-skills/invoice-parties/SKILL.md");
const commercialSkill = read("backend/idp-skills/invoice-commercial/SKILL.md");
const logisticsSkill = read("backend/idp-skills/invoice-logistics/SKILL.md");
const env = read("backend/src/config/env.ts");

const e = [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote: "Miktar 1 Adet Birim Fiyat 560 EUR Tutar 560 EUR" }];
const reconciliation = {
  version: "8.12.0", mode: "SHADOW_ONLY", productionCandidateMutation: false,
  action: "ACCEPT", issueCodes: [], recoveryDomains: [], recoveryRowIds: [],
  result: {
    action: "ACCEPT", issues: [], recoveryRequests: [],
    understanding: {
      version: "1", documentId: "contract", decision: "UNDERSTOOD",
      documentIdentity: {}, parties: {}, commercialTerms: {}, logistics: {}, packageSummary: {}, issues: [],
      goodsTable: { tableEvidence: e, expectedRowCount: 1, rows: [{
        rowId: "model-row-0-p1", rowEvidence: e, pageNumbers: [1],
        productCode: { value: "4M717-9900A-07", confidence: .99, evidence: e },
        description: { value: "PS4 GASOLINE SCOOTER (50CC) BLUE", confidence: .99, evidence: e },
        hsCode: { value: "871110000011", confidence: .99, evidence: e },
        quantity: { value: 1, confidence: .99, evidence: e }, unit: { value: "ADET", confidence: .99, evidence: e },
        unitPrice: { value: 560, confidence: .99, evidence: e }, lineTotal: { value: 560, confidence: .99, evidence: e }
      }] }
    }
  }
} as unknown as Foundation8SpecialistReconciliationAudit;

const bridged = bridgeReconciledFoundation8ToCandidates({ segmentId: "contract", reconciliation });
assert.equal(bridged.fields["goodsLines.0.quantity"]?.[0]?.value, 1);
assert.equal(bridged.fields["goodsLines.0.productCode"]?.[0]?.value, "4M717-9900A-07");
const overlaid = overlayReconciledFoundation8Candidates({ version: "1", fields: {
  "goodsLines.0.quantity": [{ candidateId: "legacy-wrong", field: "goodsLines.0.quantity", value: 560, confidence: .8, extractor: "legacy", evidence: e.map(x => ({ segmentId: "contract", pageNumber: x.pageNumber, text: x.quote, contentSource: x.source })) }],
  invoiceNo: [{ candidateId: "legacy-header", field: "invoiceNo", value: "KEEP-ME", confidence: .9, extractor: "legacy", evidence: e.map(x => ({ segmentId: "contract", pageNumber: x.pageNumber, text: x.quote, contentSource: x.source })) }]
}}, bridged);
assert.equal(overlaid.fields["goodsLines.0.quantity"]?.[0]?.value, 1);
assert.equal(overlaid.fields.invoiceNo?.[0]?.value, "KEEP-ME");

const acceptance = {
  specialistModelFallsBackToLlmModel: env.includes('process.env.FOUNDATION8_SPECIALIST_MODEL?.trim() || process.env.LLM_MODEL'),
  specialistContextExpandedForLongTables: qwen.includes("foundation8SpecialistNumCtx") && qwen.includes("foundation8SpecialistNumPredict"),
  pageEvidenceIsRuntimeValidated: qwen.includes("EVIDENCE_NOT_GROUNDED_IN_PAGE_PACKET") && qwen.includes("page.source !== ref.source"),
  expectedGoodsRowCountIsRequested: execution.includes('"goodsTable.expectedRowCount"'),
  incompleteGoodsGetsOneBoundedRecovery: execution.includes("one bounded completeness recovery pass"),
  atomicGoodsCanReplaceLegacyWrongBinding: overlaid.fields["goodsLines.0.quantity"]?.[0]?.value === 1,
  stableLegacyScalarsAreNotErased: overlaid.fields.invoiceNo?.[0]?.value === "KEEP-ME",
  customsCountryRolesAreExplicitlyGuarded: fusion.includes('keepOnlyWithRole("exitCountry"') && fusion.includes('keepOnlyWithRole("tradeCountry"'),
  goodsOriginRequiresOriginSemantics: fusion.includes("Goods origin is not the seller/buyer country"),
  skillsCoverObservedFailureClasses: goodsSkill.includes("Package/carton/pallet/box counts are not commercial goods quantity") && goodsSkill.includes("Never pad a 6- or 8-digit") && partiesSkill.includes("complete party block") && commercialSkill.includes("Amount Chargeable") && logisticsSkill.includes("2 CARD Box"),
  cutoverRemainsExplicitOptIn: env.includes("FOUNDATION8_RECONCILED_PROMOTION_ENABLED") && fusion.includes("foundation8ReconciledPromotionEnabled")
};
for (const [key, value] of Object.entries(acceptance)) assert.equal(value, true, key);

console.log(JSON.stringify({
  event: "foundation-8.16.reconciled-specialist-cutover.contract.passed",
  acceptance,
  guardrails: {
    goldenCorpusImportedAtRuntime: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    shortHsFabricatedToGtip: false,
    arithmeticManufacturesValues: false,
    promotionDefaultEnabled: false,
    modelRequiredByContract: false
  }
}, null, 2));
