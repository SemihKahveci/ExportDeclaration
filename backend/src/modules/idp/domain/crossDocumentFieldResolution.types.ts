import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { FieldCandidateEvidence } from "./fieldCandidate.types.js";

export interface CrossDocumentFieldCandidate {
  candidateId: string;
  field: string;
  value: unknown;
  logicalDocumentId: string;
  documentType: DocumentTypeValue;
  confidence: number;
  evidence: FieldCandidateEvidence[];
}

export interface CrossDocumentAuthorityTier {
  priority: number;
  documentTypes: DocumentTypeValue[];
}

export interface CrossDocumentFieldRule {
  field: string;
  authority: CrossDocumentAuthorityTier[];
}

export interface CrossDocumentResolution {
  field: string;
  status: "RESOLVED" | "REVIEW_REQUIRED";
  method: "CONSENSUS" | "CONFIGURED_AUTHORITY" | "EXPLICIT_CANDIDATE_AUTHORITY" | "CONFLICT_REVIEW" | "UNCONFIGURED_REVIEW";
  value?: unknown;
  selectedCandidateId?: string;
  candidateIds: string[];
  conflict: boolean;
  conflictCandidateIds: string[];
  reason?: string;
}
