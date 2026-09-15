import path from "node:path";
import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { UploadedFileModel } from "./document.model.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import { storage } from "../storage/storage.js";
import { LogicalDocumentModel } from "../idp/domain/logicalDocument.model.js";

export async function saveUploadedDocument(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: string;
  type: DocumentTypeValue;
  file: Express.Multer.File;
}) {
  const { companyId, declarationId, type, file } = params;
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const dec = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");

  const safeName = path.basename(file.originalname || "file");
  const storageKey = path.posix.join(String(companyId), declarationId, `${Date.now()}-${safeName}`);
  const stored = await storage.put({ key: storageKey, data: file.buffer });

  let doc;
  try {
    doc = await UploadedFileModel.create({
      companyId,
      declarationId: dec._id,
      type,
      fileName: safeName,
      filePath: stored.absolutePath, // compatibility with existing extractors
      storageKey: stored.key,
      mimeType: file.mimetype,
      size: stored.size,
      sha256: stored.sha256,
      extractionStatus: "PENDING"
    });
    // Until segmentation exists, one upload maps to one logical document spanning an unknown page range.
    await LogicalDocumentModel.create({
      companyId,
      declarationId: dec._id,
      uploadedFileId: doc._id,
      type,
      pageStart: 1
    });
  } catch (error) {
    await storage.delete(stored.key);
    throw error;
  }
  return doc.toObject();
}

type LeanDecId = { _id: mongoose.Types.ObjectId };
export async function listDocuments(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const dec = (await DeclarationModel.findOne({ _id: declarationId, companyId }).lean().exec()) as LeanDecId | null;
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");
  return UploadedFileModel.find({ companyId, declarationId: dec._id }).sort({ createdAt: 1 }).lean();
}
