import assert from "node:assert/strict";
import {
  INVOICE_SPECIALISTS,
  assertDisjointSpecialistOwnership,
  assembleInvoiceUnderstanding,
  planInvoiceUnderstandingSpecialists,
  type InvoiceSpecialistResult
} from "../../src/modules/idp/understanding/index.js";

assertDisjointSpecialistOwnership();

const evidence = [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote: "synthetic contract evidence" }];
const requests = planInvoiceUnderstandingSpecialists({
  documentId: "synthetic-contract-document",
  evidence,
  canonicalText: "synthetic contract evidence"
});

assert.deepEqual(requests.map(request => request.domain), ["PARTIES", "COMMERCIAL", "GOODS", "LOGISTICS"]);
assert.equal(new Set(requests.map(request => request.skillName)).size, 4);
assert.ok(requests.every(request => request.skillContext.includes(`# Skill: ${request.skillName}`)));
assert.ok(requests.every(request => request.evidence === evidence), "manager must share canonical evidence, not rewrite it");

const goodsRequest = requests.find(request => request.domain === "GOODS")!;
const logisticsRequest = requests.find(request => request.domain === "LOGISTICS")!;
assert.deepEqual(goodsRequest.owns, ["goodsTable"]);
assert.ok(goodsRequest.forbidden.includes("packageSummary"));
assert.ok(logisticsRequest.owns.includes("packageSummary"));
assert.ok(logisticsRequest.forbidden.includes("goodsTable"));

const ev = [{ pageNumber: 1, source: "NATIVE_TEXT" as const, quote: "row" }];
const results: InvoiceSpecialistResult[] = [
  { domain: "PARTIES", status: "COMPLETE", payload: { parties: {} }, issues: [] },
  { domain: "COMMERCIAL", status: "COMPLETE", payload: { documentIdentity: {}, commercialTerms: {} }, issues: [] },
  {
    domain: "GOODS",
    status: "COMPLETE",
    payload: { goodsTable: { tableEvidence: ev, expectedRowCount: 1, rows: [{ rowId: "row-1", rowEvidence: ev, pageNumbers: [1], description: { value: "ITEM", confidence: 0.9, evidence: ev } }] } },
    issues: []
  },
  { domain: "LOGISTICS", status: "COMPLETE", payload: { logistics: {}, packageSummary: { count: { value: 7, confidence: 0.9, evidence: ev } } }, issues: [] }
];

const assembled = assembleInvoiceUnderstanding("synthetic-contract-document", results);
assert.equal(assembled.understanding.decision, "UNDERSTOOD");
assert.equal(assembled.understanding.goodsTable.rows[0].description?.value, "ITEM");
assert.equal(assembled.understanding.packageSummary.count?.value, 7);

const partial = assembleInvoiceUnderstanding("synthetic-contract-document", results.slice(0, 3));
assert.equal(partial.understanding.decision, "PARTIAL");

const reviewResults = results.map(result => result.domain === "GOODS" ? { ...result, status: "REVIEW_REQUIRED" as const } : result);
const review = assembleInvoiceUnderstanding("synthetic-contract-document", reviewResults);
assert.equal(review.understanding.decision, "REVIEW_REQUIRED");

const output = {
  event: "foundation-8.3.specialist-orchestration.contract.passed",
  specialists: INVOICE_SPECIALISTS.map(specialist => ({
    domain: specialist.domain,
    skill: specialist.skillName,
    owns: specialist.owns,
    forbidden: specialist.forbidden
  })),
  acceptance: {
    managerPlansFourBoundedSpecialists: requests.length === 4,
    specialistSkillsLoadedFromPortableRegistry: requests.every(request => request.skillContext.includes(`# Skill: ${request.skillName}`)),
    canonicalEvidenceSharedWithoutMutation: requests.every(request => request.evidence === evidence),
    semanticOwnershipIsDisjoint: true,
    goodsCannotOwnPackageSummary: goodsRequest.forbidden.includes("packageSummary"),
    logisticsCannotOwnGoodsTable: logisticsRequest.forbidden.includes("goodsTable"),
    completeSpecialistsAssembleUnderstanding: assembled.understanding.decision === "UNDERSTOOD",
    missingSpecialistMakesUnderstandingPartial: partial.understanding.decision === "PARTIAL",
    specialistReviewPropagatesToDocument: review.understanding.decision === "REVIEW_REQUIRED"
  },
  guardrails: {
    productionExtractionWiredToManager: false,
    modelExecutionAdded: false,
    reconciliationOrJudgeAdded: false,
    foundation6PromotionChanged: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    databaseMutation: false,
    directNormalizedWrite: false
  }
};

console.log(JSON.stringify(output, null, 2));
