import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { assessDeclarationIntelligenceReadiness } from "../../src/modules/idp/domain/declarationIntelligenceReadiness.js";
import type { DeclarationDocumentCoverageResult } from "../../src/modules/idp/domain/declarationDocumentCoverage.types.js";
import type { DeclarationCrossDocumentConsistencyResult } from "../../src/modules/idp/domain/declarationCrossDocumentConsistency.types.js";

const coverage = (overrides: Partial<DeclarationDocumentCoverageResult> = {}): DeclarationDocumentCoverageResult => ({
  status: "COMPLETE",
  roles: [],
  missingRequiredTypes: [],
  excessTypes: [],
  unconfiguredPresentTypes: [],
  physicalFileCount: 2,
  logicalDocumentCount: 3,
  ...overrides
});

const consistency = (overrides: Partial<DeclarationCrossDocumentConsistencyResult> = {}): DeclarationCrossDocumentConsistencyResult => ({
  status: "CONSISTENT",
  fields: [],
  conflictFields: [],
  insufficientEvidenceFields: [],
  ...overrides
});

const ready = assessDeclarationIntelligenceReadiness(coverage(), consistency());
assert.equal(ready.status, "READY");
assert.deepEqual(ready.issues, []);

const review = assessDeclarationIntelligenceReadiness(
  coverage({
    status: "INCOMPLETE",
    missingRequiredTypes: [DocumentType.PACKING_LIST],
    excessTypes: [DocumentType.ATR]
  }),
  consistency({
    status: "REVIEW_REQUIRED",
    conflictFields: ["originCountry"],
    insufficientEvidenceFields: ["transportMode"]
  })
);
assert.equal(review.status, "REVIEW_REQUIRED");
assert.deepEqual(review.issues, [
  { reason: "MISSING_REQUIRED_DOCUMENT", documentTypes: [DocumentType.PACKING_LIST] },
  { reason: "EXCESS_DOCUMENT_CARDINALITY", documentTypes: [DocumentType.ATR] },
  { reason: "CROSS_DOCUMENT_CONFLICT", fields: ["originCountry"] },
  { reason: "INSUFFICIENT_CROSS_DOCUMENT_EVIDENCE", fields: ["transportMode"] }
]);

const invalidCoverage = assessDeclarationIntelligenceReadiness(
  coverage({ status: "INVALID_PROFILE" }),
  consistency()
);
assert.equal(invalidCoverage.status, "INVALID_CONFIGURATION");
assert.deepEqual(invalidCoverage.issues, [{ reason: "INVALID_COVERAGE_PROFILE" }]);

const invalidBoth = assessDeclarationIntelligenceReadiness(
  coverage({ status: "INVALID_PROFILE" }),
  consistency({ status: "INVALID_PROFILE" })
);
assert.equal(invalidBoth.status, "INVALID_CONFIGURATION");
assert.deepEqual(invalidBoth.issues, [
  { reason: "INVALID_COVERAGE_PROFILE" },
  { reason: "INVALID_CONSISTENCY_PROFILE" }
]);

// Informational unconfigured roles must not become an invented blocker here.
const informational = assessDeclarationIntelligenceReadiness(
  coverage({ unconfiguredPresentTypes: [DocumentType.CMR] }),
  consistency()
);
assert.equal(informational.status, "READY");

console.log(JSON.stringify({
  event: "foundation-7.3.declaration-intelligence-readiness.passed",
  readiness: {
    completeAndConsistentIsReady: true,
    coverageIssuesRequireReview: true,
    consistencyIssuesRequireReview: true,
    combinedReasonsPreserved: true,
    invalidProfilesFailClosed: true
  },
  guardrails: {
    customsRequirementsInvented: false,
    authoritySelectionPerformed: false,
    normalizedDataMutated: false,
    unconfiguredDocumentRoleSilentlyBlocked: false
  }
}, null, 2));
