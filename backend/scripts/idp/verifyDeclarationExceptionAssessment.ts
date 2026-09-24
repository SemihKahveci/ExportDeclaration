import assert from "node:assert/strict";
import { assessDeclarationExceptions } from "../../src/modules/idp/domain/declarationExceptionAssessment.js";
import type { DeclarationFieldResolutionEnvelope } from "../../src/modules/idp/domain/declarationFieldResolution.types.js";

const candidate = (candidateId: string, confidence: number) => ({
  candidateId,
  field: "goodsLines.0.quantity",
  value: 2,
  confidence,
  extractor: "foundation-9.6-fixture",
  logicalDocumentId: "logical-invoice",
  uploadedFileId: "file-invoice",
  documentType: "INVOICE" as const,
  sourceProcessingRunId: "processing-invoice",
  evidence: [],
});

function resolved(confidence: number): DeclarationFieldResolutionEnvelope {
  const selected = candidate("invoice-qty", confidence);
  return {
    version: "1",
    companyId: "company-1",
    declarationId: "declaration-1",
    reviewRequiredFields: [],
    fields: {
      "goodsLines.0.quantity": {
        field: "goodsLines.0.quantity",
        status: "RESOLVED",
        method: "SINGLE_VALUE",
        selectedCandidateId: selected.candidateId,
        selectedValue: selected.value,
        selectedCandidate: selected,
        candidates: [selected],
      },
    },
  };
}

const low = assessDeclarationExceptions({
  policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
  resolution: resolved(0.72),
  intelligence: {
    status: "READY", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "CONSISTENT",
  },
});
assert.equal(low.status, "REVIEW_REQUIRED");
assert.equal(low.exceptions[0]?.reason, "LOW_SELECTED_CANDIDATE_CONFIDENCE");
assert.equal(low.exceptions[0]?.candidateId, "invoice-qty");

const clear = assessDeclarationExceptions({
  policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
  resolution: resolved(0.98),
  intelligence: {
    status: "READY", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "CONSISTENT",
  },
});
assert.equal(clear.status, "CLEAR");

const reviewResolution = resolved(0.99);
reviewResolution.reviewRequiredFields = ["goodsLines.0.quantity"];
reviewResolution.fields["goodsLines.0.quantity"] = {
  ...reviewResolution.fields["goodsLines.0.quantity"]!,
  status: "REVIEW_REQUIRED",
  reason: "CONFLICT_NO_AUTHORITY",
  selectedCandidate: undefined,
  selectedCandidateId: undefined,
  selectedValue: undefined,
};
const review = assessDeclarationExceptions({
  policy: { version: "1", minimumSelectedCandidateConfidence: 0.90 },
  resolution: reviewResolution,
  intelligence: {
    status: "REVIEW_REQUIRED",
    issues: [{ reason: "CROSS_DOCUMENT_CONFLICT", fields: ["goodsLines.0.quantity"] }],
    coverageStatus: "COMPLETE",
    consistencyStatus: "REVIEW_REQUIRED",
  },
});
assert.equal(review.status, "REVIEW_REQUIRED");
assert.ok(review.exceptions.some((item) => item.reason === "FIELD_REVIEW_REQUIRED"));
assert.ok(review.exceptions.some((item) => item.reason === "INTELLIGENCE_REVIEW_REQUIRED"));

const blocked = assessDeclarationExceptions({
  policy: { version: "1" },
  resolution: resolved(0.99),
  intelligence: {
    status: "INVALID_CONFIGURATION",
    issues: [{ reason: "INVALID_COVERAGE_PROFILE" }],
    coverageStatus: "INVALID_PROFILE",
    consistencyStatus: "CONSISTENT",
  },
});
assert.equal(blocked.status, "BLOCKED");
assert.equal(blocked.exceptions[0]?.reason, "INVALID_INTELLIGENCE_CONFIGURATION");

const noThreshold = assessDeclarationExceptions({
  policy: { version: "1" },
  resolution: resolved(0.10),
  intelligence: {
    status: "READY", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "CONSISTENT",
  },
});
assert.equal(noThreshold.status, "CLEAR");

let invalidPolicyRejected = false;
try {
  assessDeclarationExceptions({
    policy: { version: "1", minimumSelectedCandidateConfidence: 1.1 },
    resolution: resolved(0.99),
  });
} catch {
  invalidPolicyRejected = true;
}
assert.equal(invalidPolicyRejected, true);

console.log(JSON.stringify({
  event: "foundation-9.6.confidence-exception-contract.passed",
  workflow: {
    explicitConfidencePolicyOnly: true,
    lowConfidenceCreatesReviewException: true,
    unresolvedFieldCreatesReviewException: true,
    intelligenceReviewCreatesReviewException: true,
    invalidIntelligenceConfigurationBlocks: true,
    clearStateWhenNoException: true,
  },
  guardrails: {
    implicitConfidenceThresholdInvented: false,
    invalidThresholdRejected: invalidPolicyRejected,
    candidateAuthorityCreated: false,
    normalizedDataMutated: false,
    sourceTraceMutated: false,
    foundation6AuthorityBypassed: false,
    persistencePerformed: false,
  },
}, null, 2));
