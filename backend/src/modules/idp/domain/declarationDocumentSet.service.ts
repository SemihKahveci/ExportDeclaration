import mongoose from "mongoose";
import { LogicalDocumentModel } from "./logicalDocument.model.js";
import { buildDeclarationDocumentSet } from "./declarationDocumentSet.js";
import type { DeclarationDocumentSet } from "./declarationDocumentSet.types.js";
import { validateDeclarationDocumentSetIntegrity, type DeclarationDocumentSetIntegrityResult } from "./declarationDocumentSetIntegrity.js";

export interface LoadedDeclarationDocumentSet {
  documentSet: DeclarationDocumentSet;
  integrity: DeclarationDocumentSetIntegrityResult;
}

/**
 * Loads the declaration-wide logical-document view from persisted materialization.
 * Company + declaration scoping is deliberate: documents from another tenant or
 * declaration must never leak into cross-document resolution.
 */
export async function loadDeclarationDocumentSet(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
}): Promise<LoadedDeclarationDocumentSet> {
  const logicalDocuments = await LogicalDocumentModel.find({
    companyId: params.companyId,
    declarationId: params.declarationId
  })
    .sort({ uploadedFileId: 1, pageStart: 1, pageEnd: 1, _id: 1 })
    .lean();

  const documentSet = buildDeclarationDocumentSet({
    companyId: String(params.companyId),
    declarationId: String(params.declarationId),
    logicalDocuments
  });

  return {
    documentSet,
    integrity: validateDeclarationDocumentSetIntegrity(documentSet)
  };
}
