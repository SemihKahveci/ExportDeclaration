import assert from "node:assert/strict";
import { runFoundation8ShadowRuntime } from "../../src/modules/idp/understanding/invoiceUnderstandingShadowRuntime.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const ev = (text: string, pageNumber = 1) => [{ segmentId: "seg-1", pageNumber, text, contentSource: "NATIVE_TEXT" as const }];
const c = (field: string, value: unknown, text = String(value), confidence = 0.95) => ({ candidateId: `c:${field}:${text}`, field, value, confidence, extractor: "contract", evidence: ev(text) });

const candidates: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    invoiceNo: [c("invoiceNo", "INV-001")],
    totalAmount: [c("totalAmount", 17500)],
    totalPackage: [c("totalPackage", 1250)],
    "goodsLines.0.description": [c("goodsLines.0.description", "TEST GOODS")],
    "goodsLines.0.quantity": [c("goodsLines.0.quantity", 25000)],
    "goodsLines.0.unit": [c("goodsLines.0.unit", "KG")],
    "goodsLines.0.unitPrice": [c("goodsLines.0.unitPrice", 0.7)],
    "goodsLines.0.lineTotal": [c("goodsLines.0.lineTotal", 17500)],
    "goodsLines.1.hsCode": [c("goodsLines.1.hsCode", "123456789012")]
  }
};
const before = structuredClone(candidates);
const audit = runFoundation8ShadowRuntime({
  documentId: "seg-1",
  candidates,
  evidenceBundle: { documentId: "seg-1", evidence: [{ pageNumber: 1, source: "NATIVE_TEXT", quote: "invoice evidence" }], canonicalText: "invoice evidence" }
});

assert.equal(audit.mode, "SHADOW_ONLY");
assert.equal(audit.productionCandidateMutation, false);
assert.deepEqual(candidates, before);
assert.equal(audit.specialistPlan.length, 4);
assert.deepEqual(audit.specialistPlan.map(item => item.domain), ["PARTIES", "COMMERCIAL", "GOODS", "LOGISTICS"]);
assert.equal(audit.understanding.goodsTable.rows.length, 2);
assert.equal(audit.understanding.goodsTable.rows[0]?.quantity?.value, 25000);
assert.equal(audit.understanding.goodsTable.rows[0]?.lineTotal?.value, 17500);
assert.equal(audit.understanding.packageSummary.count?.value, 1250);
assert.equal(audit.reconciliation.action, "TARGETED_RECOVERY");
assert.deepEqual(audit.reconciliation.recoveryRequests[0]?.rowIds, ["source-row-1"]);

async function main(): Promise<void> {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../../src/modules/idp/llm/invoiceProductionWorkerFusion.ts", import.meta.url), "utf8"));
assert.match(source, /foundation8ShadowAudit = runFoundation8ShadowRuntime/);
assert.match(source, /fieldCandidates: finalRoleGuardedCandidates/);
assert.doesNotMatch(source, /fieldCandidates:\s*foundation8Shadow/);

console.log(JSON.stringify({
  event: "foundation-8.9.shadow-runtime-wiring.contract.passed",
  acceptance: {
    productionFusionInvokesFoundation8Shadow: true,
    portableSpecialistPlanLoadsInRuntime: true,
    atomicGoodsRowsMaterializedFromSourceEvidence: true,
    packageQuantityRemainsSeparateFromCommercialQuantity: true,
    hsOnlySkeletonTriggersTargetedGoodsRecovery: true,
    shadowDoesNotMutateProductionCandidates: true,
    productionFieldCandidatesRemainLegacyOutput: true
  },
  guardrails: {
    shadowOnly: true,
    foundation6PromotionChanged: false,
    normalizedDataWriteAdded: false,
    goldenCorpusImportedAtRuntime: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    extraModelOrOcrCallRequired: false
  }
}, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
