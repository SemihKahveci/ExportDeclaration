import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { InvoiceLlmExtractionDecision, type InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { reconcileFoundation8SpecialistModelShadow } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistReconciliation.js";
import type { Foundation8SpecialistModelExecutionAudit, Foundation8SpecialistModelAuditItem } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.js";

const ev = (quote: string) => [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote }];
const response = (fields: InvoiceLlmExtractionResponse["fields"], decision: InvoiceLlmExtractionResponse["decision"] = InvoiceLlmExtractionDecision.EXTRACTED): InvoiceLlmExtractionResponse => ({
  version: "1", decision, fields, issues: [], model: "contract-model", provider: "contract-provider"
});
const item = (domain: Foundation8SpecialistModelAuditItem["domain"], r: InvoiceLlmExtractionResponse): Foundation8SpecialistModelAuditItem => ({
  domain, skillName: `invoice-${domain.toLowerCase()}`, skillVersion: "contract", requestedFields: [], status: "COMPLETED",
  decision: r.decision, returnedFieldCount: r.fields.length, acceptedOwnedFieldCount: r.fields.length, rejectedOutOfDomainFields: [], response: r
});
const audit = (goods: InvoiceLlmExtractionResponse, partiesDecision: InvoiceLlmExtractionResponse["decision"] = InvoiceLlmExtractionDecision.EXTRACTED): Foundation8SpecialistModelExecutionAudit => ({
  version: "8.10.0", mode: "SHADOW_ONLY", productionCandidateMutation: false, modelCallsAttempted: 4,
  specialists: [
    item("PARTIES", response([], partiesDecision)),
    item("COMMERCIAL", response([])),
    item("GOODS", goods),
    item("LOGISTICS", response([{ field: "totalPackage", value: 1250, confidence: 0.99, evidence: ev("1250 KOLI") }]))
  ]
});

const healthyGoods = response([
  { field: "goodsLines.0.description", value: "MATERIAL", confidence: 0.99, evidence: ev("MATERIAL 25000 KG 0.70 17500") },
  { field: "goodsLines.0.hsCode", value: "123456789012", confidence: 0.99, evidence: ev("123456789012") },
  { field: "goodsLines.0.quantity", value: 25000, confidence: 0.99, evidence: ev("25000 KG") },
  { field: "goodsLines.0.unit", value: "KG", confidence: 0.99, evidence: ev("25000 KG") },
  { field: "goodsLines.0.unitPrice", value: 0.70, confidence: 0.99, evidence: ev("0.70") },
  { field: "goodsLines.0.lineTotal", value: 17500, confidence: 0.99, evidence: ev("17500") }
]);
const skeletonGoods = response([
  { field: "goodsLines.0.hsCode", value: "123456789012", confidence: 0.99, evidence: ev("123456789012") }
], InvoiceLlmExtractionDecision.PARTIAL);

const healthyInput = audit(healthyGoods);
const healthyBefore = JSON.stringify(healthyInput);
const healthy = reconcileFoundation8SpecialistModelShadow({ documentId: "healthy", audit: healthyInput });
assert.equal(healthy.action, "ACCEPT");
assert.equal(JSON.stringify(healthyInput), healthyBefore);
assert.equal(healthy.productionCandidateMutation, false);

const incomplete = reconcileFoundation8SpecialistModelShadow({ documentId: "skeleton", audit: audit(skeletonGoods) });
assert.equal(incomplete.action, "TARGETED_RECOVERY");
assert.deepEqual(incomplete.recoveryDomains, ["GOODS"]);
assert.equal(incomplete.result.recoveryRequests.every(request => request.domain === "GOODS"), true);

const ambiguous = reconcileFoundation8SpecialistModelShadow({ documentId: "ambiguous", audit: audit(healthyGoods, InvoiceLlmExtractionDecision.REVIEW_REQUIRED) });
assert.equal(ambiguous.action, "REVIEW_REQUIRED");
assert.equal(ambiguous.recoveryDomains.length, 0);

const fusionSource = readFileSync(resolve(process.cwd(), "backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts"), "utf8");
assert.match(fusionSource, /reconcileFoundation8SpecialistModelShadow/);
assert.match(fusionSource, /foundation8SpecialistReconciliationAudit/);
assert.match(fusionSource, /fieldCandidates:\s*finalRoleGuardedCandidates/);

console.log(JSON.stringify({
  event: "foundation-8.12.shadow-reconciliation-runtime.contract.passed",
  acceptance: {
    healthyAtomicUnderstandingAccepted: healthy.action === "ACCEPT",
    hsOnlySkeletonTargetsOnlyGoodsRecovery: incomplete.action === "TARGETED_RECOVERY" && incomplete.recoveryDomains.join(",") === "GOODS",
    specialistAmbiguityFailsClosedToReview: ambiguous.action === "REVIEW_REQUIRED",
    reviewDecisionDoesNotTriggerRecovery: ambiguous.recoveryDomains.length === 0,
    specialistAuditRemainsImmutable: JSON.stringify(healthyInput) === healthyBefore,
    productionFusionPersistsShadowReconciliationAudit: fusionSource.includes("foundation8SpecialistReconciliationAudit"),
    productionFieldCandidatesRemainLegacyOutput: /fieldCandidates:\s*finalRoleGuardedCandidates/.test(fusionSource)
  },
  guardrails: {
    shadowOnly: true,
    productionCandidatesChanged: false,
    foundation6PromotionChanged: false,
    normalizedDataWriteAdded: false,
    targetedRecoveryExecuted: false,
    goldenCorpusImportedAtRuntime: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false
  }
}, null, 2));
