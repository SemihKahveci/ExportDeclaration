import type { DocumentTypeValue } from "../../../common/enums/documentType.js";

export type DeclarationIntelligenceReadinessReason =
  | "INVALID_COVERAGE_PROFILE"
  | "INVALID_CONSISTENCY_PROFILE"
  | "MISSING_REQUIRED_DOCUMENT"
  | "EXCESS_DOCUMENT_CARDINALITY"
  | "CROSS_DOCUMENT_CONFLICT"
  | "INSUFFICIENT_CROSS_DOCUMENT_EVIDENCE";

export interface DeclarationIntelligenceReadinessIssue {
  reason: DeclarationIntelligenceReadinessReason;
  documentTypes?: DocumentTypeValue[];
  fields?: string[];
}

export interface DeclarationIntelligenceReadinessResult {
  status: "READY" | "REVIEW_REQUIRED" | "INVALID_CONFIGURATION";
  issues: DeclarationIntelligenceReadinessIssue[];
  coverageStatus: "COMPLETE" | "INCOMPLETE" | "INVALID_PROFILE";
  consistencyStatus: "CONSISTENT" | "REVIEW_REQUIRED" | "INVALID_PROFILE";
}
