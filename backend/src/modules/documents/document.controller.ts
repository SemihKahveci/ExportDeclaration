import type { Request, Response } from "express";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DocumentType, type DocumentTypeValue } from "../../common/enums/documentType.js";
import { listDocuments, saveUploadedDocument } from "./document.service.js";
import { enqueueDocumentProcessing, listProcessingRuns } from "../idp/queue/idpProcessing.service.js";

export async function postDocument(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new HttpError(400, "Dosya gerekli.");
  const typeRaw = (req.body?.type as string | undefined) ?? req.query.type;
  if (!typeRaw || !Object.values(DocumentType).includes(typeRaw as DocumentTypeValue)) {
    throw new HttpError(400, `Geçerli type gerekli: ${Object.values(DocumentType).join(", ")}`);
  }

  const doc = await saveUploadedDocument({
    companyId: req.auth!.operationalCompanyId,
    declarationId: req.params.id!,
    type: typeRaw as DocumentTypeValue,
    file: req.file
  });

  // Her başarılı upload IDP kuyruğuna otomatik girer.
  // /:documentId/process endpoint'i manuel retry/reprocess için ayrıca korunur.
  await enqueueDocumentProcessing({
    companyId: req.auth!.operationalCompanyId,
    declarationId: req.params.id!,
    uploadedFileId: String(doc._id)
  });

  res.status(201).json({ ok: true, data: doc });
}

export async function getDocuments(req: Request, res: Response): Promise<void> {
  const list = await listDocuments(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data: list });
}

export async function postProcessDocument(req: Request, res: Response): Promise<void> {
  const run = await enqueueDocumentProcessing({
    companyId: req.auth!.operationalCompanyId,
    declarationId: req.params.id!,
    uploadedFileId: req.params.documentId!
  });
  res.status(202).json({ ok: true, data: run });
}

export async function getProcessingRuns(req: Request, res: Response): Promise<void> {
  const runs = await listProcessingRuns(req.auth!.operationalCompanyId, req.params.documentId!);
  res.json({ ok: true, data: runs });
}
