import { apiGetJson, apiPostJson } from "./apiClient";

export type HumanReviewDecision = "SELECT_CANDIDATE" | "KEEP_REVIEW_REQUIRED";
export type EvidenceSource = "NATIVE_TEXT" | "OCR" | "DERIVED";

export interface DeclarationReviewEvidence {
  segmentId?: string;
  pageNumber: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  text?: string;
  contentSource?: EvidenceSource;
}

export interface DeclarationReviewCandidate {
  candidateId: string;
  field: string;
  value: unknown;
  confidence: number;
  extractor: string;
  documentType: string;
  logicalDocumentId: string;
  uploadedFileId: string;
  sourceProcessingRunId?: string;
  evidence: DeclarationReviewEvidence[];
  derived?: boolean;
}

export interface DeclarationReviewField {
  field: string;
  candidates: DeclarationReviewCandidate[];
}

export interface DeclarationHumanReviewRequest {
  version: "1";
  companyId: string;
  declarationId: string;
  sourceResolutionRunId: string;
  fields: DeclarationReviewField[];
}

export interface CurrentDeclarationHumanReview {
  required: boolean;
  sourceResolutionRunId: string;
  request: DeclarationHumanReviewRequest | null;
}

export interface DeclarationHumanReviewSubmitResult {
  reviewRunId: string;
  reviewStatus: "DECIDED" | "REVIEW_REQUIRED";
  reusedReviewRun: boolean;
  authorityApplied: boolean;
  authority: unknown | null;
}

export interface DeclarationHumanReviewAuditRun {
  _id: string;
  sourceResolutionRunId: string;
  actorUserId: string;
  status: "DECIDED" | "REVIEW_REQUIRED";
  decisions: Array<{
    field: string;
    decision: HumanReviewDecision;
    candidateId?: string;
    note?: string;
  }>;
  createdAt: string;
}

export function getCurrentDeclarationHumanReview(declarationId: string) {
  return apiGetJson<CurrentDeclarationHumanReview>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-human-review/current`
  );
}

export function submitCurrentDeclarationHumanReview(
  declarationId: string,
  body: {
    sourceResolutionRunId: string;
    decisions: Array<{
      field: string;
      decision: HumanReviewDecision;
      candidateId?: string;
      note?: string;
    }>;
  }
) {
  return apiPostJson<DeclarationHumanReviewSubmitResult>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-human-review/current`,
    body
  );
}

export function listDeclarationHumanReviewAudit(declarationId: string) {
  return apiGetJson<DeclarationHumanReviewAuditRun[]>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-human-review/audit`
  );
}
