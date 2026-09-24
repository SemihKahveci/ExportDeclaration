import type { DeclarationFieldResolutionEnvelope } from "./declarationFieldResolution.types.js";
import type { DeclarationIntelligenceReadinessResult } from "./declarationIntelligenceReadiness.types.js";

export interface DeclarationExceptionPolicy {
  version: "1";
  minimumSelectedCandidateConfidence?: number;
}

export type DeclarationExceptionReason =
  | "FIELD_REVIEW_REQUIRED"
  | "LOW_SELECTED_CANDIDATE_CONFIDENCE"
  | "INTELLIGENCE_REVIEW_REQUIRED"
  | "INVALID_INTELLIGENCE_CONFIGURATION";

export interface DeclarationException {
  exceptionId: string;
  reason: DeclarationExceptionReason;
  severity: "REVIEW" | "BLOCKING";
  field?: string;
  candidateId?: string;
  confidence?: number;
  threshold?: number;
}

export interface DeclarationExceptionAssessment {
  version: "1";
  companyId: string;
  declarationId: string;
  status: "CLEAR" | "REVIEW_REQUIRED" | "BLOCKED";
  exceptions: DeclarationException[];
}

export interface AssessDeclarationExceptionsParams {
  policy: DeclarationExceptionPolicy;
  resolution: DeclarationFieldResolutionEnvelope;
  intelligence?: DeclarationIntelligenceReadinessResult;
}
