import path from "node:path";
import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { UploadedFileModel } from "./document.model.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import { storage } from "../storage/storage.js";
import { LogicalDocumentModel } from "../idp/domain/logicalDocument.model.js";
import { renderPdfPage } from "./pdfPageRenderer.js";

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
type LeanUploadedFile = {
  _id: mongoose.Types.ObjectId;
  storageKey?: string;
  fileName?: string;
  mimeType?: string;
};
export async function listDocuments(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const dec = (await DeclarationModel.findOne({ _id: declarationId, companyId }).lean().exec()) as LeanDecId | null;
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");
  return UploadedFileModel.find({ companyId, declarationId: dec._id }).sort({ createdAt: 1 }).lean();
}


export async function getDocumentContentDescriptor(companyId: mongoose.Types.ObjectId, declarationId: string, documentId: string) {
  if (!mongoose.isValidObjectId(declarationId) || !mongoose.isValidObjectId(documentId)) {
    throw new HttpError(400, "Geçersiz beyanname veya evrak id.");
  }
  const doc = (await UploadedFileModel.findOne({
    _id: documentId,
    declarationId,
    companyId,
  }).lean().exec()) as LeanUploadedFile | null;
  if (!doc) throw new HttpError(404, "Evrak bulunamadı.");
  if (!doc.storageKey) throw new HttpError(409, "Evrak storage kaydı bulunmuyor.");
  return {
    absolutePath: storage.resolve(doc.storageKey),
    fileName: doc.fileName ?? "document",
    mimeType: doc.mimeType ?? "application/octet-stream",
  };
}

export async function renderDocumentPage(companyId: mongoose.Types.ObjectId, declarationId: string, documentId: string, pageNumber: number): Promise<Buffer> {
  const descriptor = await getDocumentContentDescriptor(companyId, declarationId, documentId);
  if (descriptor.mimeType !== "application/pdf" && !descriptor.fileName.toLowerCase().endsWith(".pdf")) {
    throw new HttpError(415, "Sayfa önizleme yalnız PDF evraklar için destekleniyor.");
  }
  return renderPdfPage(descriptor.absolutePath, pageNumber);
}
