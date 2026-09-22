import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { FieldCandidateEvidence } from "./fieldCandidate.types.js";

export interface DeclarationFieldCandidate {
  candidateId: string;
  field: string;
  value: unknown;
  confidence: number;
  extractor: string;
  logicalDocumentId: string;
  uploadedFileId: string;
  documentType: DocumentTypeValue;
  sourceProcessingRunId?: string;
  evidence: FieldCandidateEvidence[];
}

export interface DeclarationFieldCandidateEnvelope {
  version: "1";
  companyId: string;
  declarationId: string;
  fields: Record<string, DeclarationFieldCandidate[]>;
}
