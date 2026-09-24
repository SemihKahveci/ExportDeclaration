import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { FieldCandidateEvidence } from "./fieldCandidate.types.js";

export const DeclarationHumanReviewDecision = {
  SELECT_CANDIDATE: "SELECT_CANDIDATE",
  KEEP_REVIEW_REQUIRED: "KEEP_REVIEW_REQUIRED"
} as const;

export type DeclarationHumanReviewDecisionValue =
  (typeof DeclarationHumanReviewDecision)[keyof typeof DeclarationHumanReviewDecision];

export interface DeclarationHumanReviewCandidate {
  candidateId: string;
  field: string;
  value: unknown;
  confidence: number;
  extractor: string;
  documentType: DocumentTypeValue;
  logicalDocumentId: string;
  uploadedFileId: string;
  sourceProcessingRunId?: string;
  evidence: FieldCandidateEvidence[];
  derived?: boolean;
}

export interface DeclarationHumanReviewField {
  field: string;
  candidates: DeclarationHumanReviewCandidate[];
}

export interface DeclarationHumanReviewRequest {
  version: "1";
  companyId: string;
  declarationId: string;
  sourceResolutionRunId: string;
  fields: DeclarationHumanReviewField[];
}

export interface DeclarationHumanReviewFieldDecision {
  field: string;
  decision: DeclarationHumanReviewDecisionValue;
  candidateId?: string;
  note?: string;
}

export interface DeclarationHumanReviewSubmission {
  version: "1";
  companyId: string;
  declarationId: string;
  sourceResolutionRunId: string;
  actorUserId: string;
  decisions: DeclarationHumanReviewFieldDecision[];
}
