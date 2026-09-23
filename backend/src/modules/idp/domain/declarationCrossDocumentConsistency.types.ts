import type { DocumentTypeValue } from "../../../common/enums/documentType.js";

export type DeclarationConsistencyComparator =
  | { kind: "EXACT" }
  | { kind: "CASE_INSENSITIVE_TEXT" }
  | { kind: "NUMERIC_TOLERANCE"; absoluteTolerance: number };

export interface DeclarationCrossDocumentConsistencyRule {
  field: string;
  documentTypes: DocumentTypeValue[];
  comparator: DeclarationConsistencyComparator;
  requireAllDocumentTypes?: boolean;
}

export interface DeclarationCrossDocumentConsistencyProfile {
  version: "1";
  rules: DeclarationCrossDocumentConsistencyRule[];
}

export interface DeclarationConsistencyObservation {
  candidateId: string;
  documentType: DocumentTypeValue;
  logicalDocumentId: string;
  uploadedFileId: string;
  value: unknown;
}

export interface DeclarationFieldConsistencyResult {
  field: string;
  status: "CONSISTENT" | "CONFLICT" | "INSUFFICIENT_EVIDENCE";
  documentTypes: DocumentTypeValue[];
  missingDocumentTypes: DocumentTypeValue[];
  observations: DeclarationConsistencyObservation[];
  reason?: "MISSING_CONFIGURED_DOCUMENT_TYPE" | "FEWER_THAN_TWO_DOCUMENT_TYPES" | "VALUE_MISMATCH";
}

export interface DeclarationCrossDocumentConsistencyResult {
  status: "CONSISTENT" | "REVIEW_REQUIRED" | "INVALID_PROFILE";
  fields: DeclarationFieldConsistencyResult[];
  conflictFields: string[];
  insufficientEvidenceFields: string[];
}
