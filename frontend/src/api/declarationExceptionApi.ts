import { apiGetJson } from "./apiClient";

export type DeclarationExceptionStatus = "CLEAR" | "REVIEW_REQUIRED" | "BLOCKED";

export interface DeclarationExceptionItem {
  exceptionId: string;
  reason:
    | "FIELD_REVIEW_REQUIRED"
    | "LOW_SELECTED_CANDIDATE_CONFIDENCE"
    | "INTELLIGENCE_REVIEW_REQUIRED"
    | "INVALID_INTELLIGENCE_CONFIGURATION";
  severity: "REVIEW" | "BLOCKING";
  field?: string;
  candidateId?: string;
  confidence?: number;
  threshold?: number;
}

export interface DeclarationExceptionSnapshot {
  version: "1";
  assessmentRunId: string;
  sourceResolutionRunId: string;
  sourceIntelligenceAssessmentRunId?: string;
  status: DeclarationExceptionStatus;
  exceptions: DeclarationExceptionItem[];
  policy: { version: "1"; minimumSelectedCandidateConfidence?: number };
  assessedAt: string;
}

export function getCurrentDeclarationExceptions(declarationId: string) {
  return apiGetJson<{ available: boolean; current: DeclarationExceptionSnapshot | null }>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-exceptions/current`,
  );
}

export function listDeclarationExceptionAudit(declarationId: string) {
  return apiGetJson<DeclarationExceptionSnapshot[]>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-exceptions/audit`,
  );
}
