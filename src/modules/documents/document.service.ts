import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { env } from "../../config/env.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { UploadedDocumentModel } from "./document.model.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";

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

  const relDir = path.join(String(companyId), declarationId);
  const absDir = path.join(env.uploadDir, relDir);
  await fs.mkdir(absDir, { recursive: true });
  const safeName = path.basename(file.originalname || "file");
  const dest = path.join(absDir, `${Date.now()}-${safeName}`);
  await fs.writeFile(dest, file.buffer);

  const doc = await UploadedDocumentModel.create({
    companyId,
    declarationId: dec._id,
    type,
    fileName: safeName,
    filePath: dest,
    mimeType: file.mimetype,
    extractionStatus: "PENDING"
  });

  return doc.toObject();
}

type LeanDecId = { _id: mongoose.Types.ObjectId };

export async function listDocuments(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const dec = (await DeclarationModel.findOne({ _id: declarationId, companyId }).lean().exec()) as LeanDecId | null;
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");
  return UploadedDocumentModel.find({ companyId, declarationId: dec._id }).sort({ createdAt: 1 }).lean();
}
