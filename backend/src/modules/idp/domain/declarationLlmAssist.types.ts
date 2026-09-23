import type { DocumentTypeValue } from "../../../common/enums/documentType.js";

export const DeclarationLlmAssistDecision = {
  RESOLVED: "RESOLVED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;

export type DeclarationLlmAssistDecisionValue =
  (typeof DeclarationLlmAssistDecision)[keyof typeof DeclarationLlmAssistDecision];

export interface DeclarationLlmAssistCandidate {
  candidateId: string;
  field: string;
  documentType: DocumentTypeValue;
  logicalDocumentId: string;
  uploadedFileId: string;
  value: unknown;
}

export interface DeclarationLlmAssistField {
  field: string;
  candidates: DeclarationLlmAssistCandidate[];
}

export interface DeclarationLlmAssistRequest {
  version: "1";
  task: "RESOLVE_DECLARATION_CONFLICTS";
  companyId: string;
  declarationId: string;
  fields: DeclarationLlmAssistField[];
}

export interface DeclarationLlmAssistSelection {
  field: string;
  candidateId: string;
}

export interface DeclarationLlmAssistResponse {
  version: "1";
  decision: DeclarationLlmAssistDecisionValue;
  selections: DeclarationLlmAssistSelection[];
  issues: Array<{ code: string; message: string }>;
  model: string;
  provider: string;
}
