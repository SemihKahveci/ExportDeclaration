import path from "node:path";
import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { UploadedFileModel } from "./document.model.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import { storage } from "../storage/storage.js";
import { LogicalDocumentModel } from "../idp/domain/logicalDocument.model.js";
import { renderPdfPage } from "./pdfPageRenderer.js";
import { ProcessingRunModel } from "../idp/domain/processingRun.model.js";

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
      pageStart: 1,
      classificationMethod: "UPLOAD_DECLARED",
      classificationEvidence: ["upload-declared-type"]
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


export interface PersistedPageEvidence {
  candidateId?: string;
  field: string;
  value?: unknown;
  extractor?: string;
  confidence?: number;
  pageNumber: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  text?: string;
  contentSource?: "NATIVE_TEXT" | "OCR";
}

function evidenceCandidateEnvelopes(run: any): any[] {
  const result: any[] = [];
  for (const segment of run?.candidates?.segments ?? []) {
    const audit = segment?.data?.genericCandidateAudit;
    if (!audit) continue;
    for (const key of ["candidates", "headerPartyCandidates", "commercialTermsCandidates", "shipmentCandidates", "originCandidates"]) {
      if (audit[key]?.fields) result.push(audit[key]);
    }
  }
  return result;
}

export async function listDocumentPageEvidence(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
  documentId: string,
  pageNumber: number
): Promise<{ processingRunId: string; uploadedFileId: string; pageNumber: number; evidence: PersistedPageEvidence[] }> {
  // Reuse the document descriptor lookup so tenant + declaration + exact physical file scoping
  // is identical to content/page-image access.
  await getDocumentContentDescriptor(companyId, declarationId, documentId);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new HttpError(400, "Geçersiz PDF sayfa numarası.");

  const run: any = await ProcessingRunModel.findOne({
    companyId,
    declarationId,
    uploadedFileId: documentId,
    status: "COMPLETED",
  }).sort({ createdAt: -1 }).lean();

  if (!run) throw new HttpError(404, "Bu evrak için tamamlanmış processing run bulunamadı.");

  const rows: PersistedPageEvidence[] = [];
  const seen = new Set<string>();
  for (const envelope of evidenceCandidateEnvelopes(run)) {
    for (const candidates of Object.values(envelope.fields ?? {}) as any[][]) {
      for (const candidate of candidates ?? []) {
        for (const ev of candidate?.evidence ?? []) {
          const b = ev?.bbox;
          if (
            ev?.contentSource === "DERIVED" ||
            ev?.pageNumber !== pageNumber ||
            !b ||
            ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) ||
            b.x0 < 0 || b.y0 < 0 || b.x1 > 1 || b.y1 > 1 ||
            b.x1 <= b.x0 || b.y1 <= b.y0
          ) continue;
          const key = [candidate.field, String(candidate.value ?? ""), b.x0, b.y0, b.x1, b.y1, ev.text ?? ""].join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            candidateId: candidate.candidateId,
            field: candidate.field,
            value: candidate.value,
            extractor: candidate.extractor,
            confidence: candidate.confidence,
            pageNumber,
            bbox: b,
            text: ev.text,
            contentSource: ev.contentSource,
          });
        }
      }
    }
  }

  return {
    processingRunId: String(run._id),
    uploadedFileId: documentId,
    pageNumber,
    evidence: rows,
  };
}
