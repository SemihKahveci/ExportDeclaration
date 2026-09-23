import type { CrossDocumentFieldRule, CrossDocumentResolution } from "./crossDocumentFieldResolution.types.js";
import type { DeclarationFieldCandidate, DeclarationFieldCandidateEnvelope } from "./declarationFieldCandidate.types.js";

export interface DeclarationCandidateAuthoritySelection {
  field: string;
  candidateId: string;
  source: "LLM_ASSIST";
}

export interface ResolvedDeclarationField extends CrossDocumentResolution {
  selectedCandidate?: DeclarationFieldCandidate;
  candidates: DeclarationFieldCandidate[];
}

export interface DeclarationFieldResolutionEnvelope {
  version: "1";
  companyId: string;
  declarationId: string;
  fields: Record<string, ResolvedDeclarationField>;
  reviewRequiredFields: string[];
}

export interface ResolveDeclarationFieldsParams {
  candidates: DeclarationFieldCandidateEnvelope;
  rules?: CrossDocumentFieldRule[];
  candidateSelections?: DeclarationCandidateAuthoritySelection[];
}
