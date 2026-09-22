import type { DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { DeclarationDocumentRef, DeclarationDocumentSet } from "./declarationDocumentSet.types.js";

export function buildDeclarationDocumentSet(params: {
  companyId: string;
  declarationId: string;
  logicalDocuments: Array<{
    _id: unknown; uploadedFileId: unknown; type: string; pageStart: number; pageEnd?: number;
    classificationConfidence?: number; sourceProcessingRunId?: unknown;
  }>;
}): DeclarationDocumentSet {
  const documents: DeclarationDocumentRef[] = params.logicalDocuments
    .map((doc) => ({
      logicalDocumentId: String(doc._id),
      uploadedFileId: String(doc.uploadedFileId),
      type: doc.type as DocumentTypeValue,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd ?? doc.pageStart,
      classificationConfidence: doc.classificationConfidence,
      sourceProcessingRunId: doc.sourceProcessingRunId ? String(doc.sourceProcessingRunId) : undefined
    }))
    .sort((a, b) => a.uploadedFileId.localeCompare(b.uploadedFileId) || a.pageStart - b.pageStart);

  const roles: DeclarationDocumentSet["roles"] = {};
  for (const document of documents) {
    (roles[document.type] ??= []).push(document);
  }

  return { version: "1", companyId: params.companyId, declarationId: params.declarationId, documents, roles };
}
