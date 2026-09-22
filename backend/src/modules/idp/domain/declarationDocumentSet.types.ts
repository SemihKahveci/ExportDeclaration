import type { DocumentTypeValue } from "../../../common/enums/documentType.js";

export interface DeclarationDocumentRef {
  logicalDocumentId: string;
  uploadedFileId: string;
  type: DocumentTypeValue;
  pageStart: number;
  pageEnd: number;
  classificationConfidence?: number;
  sourceProcessingRunId?: string;
}

export interface DeclarationDocumentSet {
  version: "1";
  companyId: string;
  declarationId: string;
  documents: DeclarationDocumentRef[];
  roles: Partial<Record<DocumentTypeValue, DeclarationDocumentRef[]>>;
}
