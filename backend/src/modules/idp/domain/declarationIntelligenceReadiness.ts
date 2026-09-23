import type { DeclarationCrossDocumentConsistencyResult } from "./declarationCrossDocumentConsistency.types.js";
import type { DeclarationDocumentCoverageResult } from "./declarationDocumentCoverage.types.js";
import type {
  DeclarationIntelligenceReadinessIssue,
  DeclarationIntelligenceReadinessResult
} from "./declarationIntelligenceReadiness.types.js";

/**
 * Combines already-evaluated Foundation 7 coverage and consistency results into
 * one read-only declaration readiness decision. It does not invent document
 * requirements, consistency rules, authority, or mutate normalized data.
 */
export function assessDeclarationIntelligenceReadiness(
  coverage: DeclarationDocumentCoverageResult,
  consistency: DeclarationCrossDocumentConsistencyResult
): DeclarationIntelligenceReadinessResult {
  const issues: DeclarationIntelligenceReadinessIssue[] = [];

  if (coverage.status === "INVALID_PROFILE") {
    issues.push({ reason: "INVALID_COVERAGE_PROFILE" });
  }
  if (consistency.status === "INVALID_PROFILE") {
    issues.push({ reason: "INVALID_CONSISTENCY_PROFILE" });
  }

  if (issues.length > 0) {
    return {
      status: "INVALID_CONFIGURATION",
      issues,
      coverageStatus: coverage.status,
      consistencyStatus: consistency.status
    };
  }

  if (coverage.missingRequiredTypes.length > 0) {
    issues.push({ reason: "MISSING_REQUIRED_DOCUMENT", documentTypes: [...coverage.missingRequiredTypes] });
  }
  if (coverage.excessTypes.length > 0) {
    issues.push({ reason: "EXCESS_DOCUMENT_CARDINALITY", documentTypes: [...coverage.excessTypes] });
  }
  if (consistency.conflictFields.length > 0) {
    issues.push({ reason: "CROSS_DOCUMENT_CONFLICT", fields: [...consistency.conflictFields] });
  }
  if (consistency.insufficientEvidenceFields.length > 0) {
    issues.push({ reason: "INSUFFICIENT_CROSS_DOCUMENT_EVIDENCE", fields: [...consistency.insufficientEvidenceFields] });
  }

  return {
    status: issues.length === 0 ? "READY" : "REVIEW_REQUIRED",
    issues,
    coverageStatus: coverage.status,
    consistencyStatus: consistency.status
  };
}
