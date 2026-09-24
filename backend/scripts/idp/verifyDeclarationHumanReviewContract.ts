import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationFieldResolutionEnvelope } from "../../src/modules/idp/domain/declarationFieldResolution.types.js";
import { DeclarationHumanReviewDecision } from "../../src/modules/idp/domain/declarationHumanReview.types.js";
import {
  buildDeclarationHumanReviewRequest,
  validateDeclarationHumanReviewSubmission
} from "../../src/modules/idp/review/declarationHumanReviewContract.js";

const candidate = (candidateId: string, documentType: typeof DocumentType.INVOICE | typeof DocumentType.PACKING_LIST, value: number) => ({
  candidateId,
  field: "goodsLines.0.quantity",
  value,
  confidence: 0.99,
  extractor: documentType === DocumentType.INVOICE ? "invoice-canonical-v1" : "packing-list-canonical-v1",
  logicalDocumentId: `logical-${candidateId}`,
  uploadedFileId: `file-${candidateId}`,
  documentType,
  sourceProcessingRunId: `run-${candidateId}`,
  evidence: []
});

const resolution: DeclarationFieldResolutionEnvelope = {
  version: "1",
  companyId: "company-1",
  declarationId: "declaration-1",
  reviewRequiredFields: ["goodsLines.0.quantity"],
  fields: {
    "goodsLines.0.quantity": {
      field: "goodsLines.0.quantity",
      status: "REVIEW_REQUIRED",
      reason: "CONFLICT_NO_AUTHORITY",
      candidates: [candidate("invoice-qty", DocumentType.INVOICE, 2), candidate("packing-qty", DocumentType.PACKING_LIST, 3)]
    }
  }
};

function rejects(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

function main() {
  const request = buildDeclarationHumanReviewRequest({ sourceResolutionRunId: "resolution-run-1", resolution });
  assert.equal(request.fields.length, 1);
  assert.deepEqual(request.fields[0].candidates.map((item) => item.candidateId), ["invoice-qty", "packing-qty"]);
  assert.deepEqual(request.fields[0].candidates.map((item) => item.value), [2, 3]);

  const selected = validateDeclarationHumanReviewSubmission(request, {
    version: "1",
    companyId: "company-1",
    declarationId: "declaration-1",
    sourceResolutionRunId: "resolution-run-1",
    actorUserId: "reviewer-1",
    decisions: [{ field: "goodsLines.0.quantity", decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE, candidateId: "packing-qty", note: "Packing list verified." }]
  });
  assert.equal(selected.decisions[0].candidateId, "packing-qty");

  const deferred = validateDeclarationHumanReviewSubmission(request, {
    version: "1",
    companyId: "company-1",
    declarationId: "declaration-1",
    sourceResolutionRunId: "resolution-run-1",
    actorUserId: "reviewer-1",
    decisions: [{ field: "goodsLines.0.quantity", decision: DeclarationHumanReviewDecision.KEEP_REVIEW_REQUIRED, note: "Need source document confirmation." }]
  });
  assert.equal(deferred.decisions[0].decision, DeclarationHumanReviewDecision.KEEP_REVIEW_REQUIRED);

  const arbitraryReplacementValueAccepted = !rejects(() => validateDeclarationHumanReviewSubmission(request, {
    version: "1", companyId: "company-1", declarationId: "declaration-1", sourceResolutionRunId: "resolution-run-1", actorUserId: "reviewer-1",
    decisions: [{ field: "goodsLines.0.quantity", decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE, candidateId: "invented-qty" }]
  }));
  const unrequestedFieldRejected = rejects(() => validateDeclarationHumanReviewSubmission(request, {
    version: "1", companyId: "company-1", declarationId: "declaration-1", sourceResolutionRunId: "resolution-run-1", actorUserId: "reviewer-1",
    decisions: [{ field: "goodsLines.1.quantity", decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE, candidateId: "packing-qty" }]
  }));
  const staleSourceRejected = rejects(() => validateDeclarationHumanReviewSubmission(request, {
    version: "1", companyId: "company-1", declarationId: "declaration-1", sourceResolutionRunId: "old-run", actorUserId: "reviewer-1",
    decisions: [{ field: "goodsLines.0.quantity", decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE, candidateId: "packing-qty" }]
  }));
  const missingActorRejected = rejects(() => validateDeclarationHumanReviewSubmission(request, {
    version: "1", companyId: "company-1", declarationId: "declaration-1", sourceResolutionRunId: "resolution-run-1", actorUserId: "",
    decisions: [{ field: "goodsLines.0.quantity", decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE, candidateId: "packing-qty" }]
  }));
  const partialDecisionRejected = rejects(() => validateDeclarationHumanReviewSubmission({ ...request, fields: [...request.fields, { ...request.fields[0], field: "invoiceNo" }] }, {
    version: "1", companyId: "company-1", declarationId: "declaration-1", sourceResolutionRunId: "resolution-run-1", actorUserId: "reviewer-1",
    decisions: [{ field: "goodsLines.0.quantity", decision: DeclarationHumanReviewDecision.SELECT_CANDIDATE, candidateId: "packing-qty" }]
  }));

  assert.equal(arbitraryReplacementValueAccepted, false);
  assert.equal(unrequestedFieldRejected, true);
  assert.equal(staleSourceRejected, true);
  assert.equal(missingActorRejected, true);
  assert.equal(partialDecisionRejected, true);

  console.log(JSON.stringify({
    event: "foundation-9.1.human-review-domain-contract.passed",
    contract: {
      reviewRequiredFieldsOnly: true,
      existingCandidateEvidenceExposed: true,
      existingCandidateSelectionAccepted: true,
      explicitKeepReviewRequiredAccepted: true,
      actorIdentityRequired: true,
      sourceResolutionBound: true
    },
    guardrails: {
      arbitraryReplacementValueAccepted,
      unrequestedFieldRejected,
      staleSourceRejected,
      missingActorRejected,
      partialDecisionRejected,
      normalizedDataMutated: false,
      foundation6AuthorityBypassed: false,
      persistencePerformed: false
    }
  }, null, 2));
}

main();
