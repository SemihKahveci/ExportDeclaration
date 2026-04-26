import type { Request, Response } from "express";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DocumentType, type DocumentTypeValue } from "../../common/enums/documentType.js";
import { listDocuments, saveUploadedDocument } from "./document.service.js";

export async function postDocument(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new HttpError(400, "Dosya gerekli.");
  const typeRaw = (req.body?.type as string | undefined) ?? req.query.type;
  if (!typeRaw || !Object.values(DocumentType).includes(typeRaw as DocumentTypeValue)) {
    throw new HttpError(400, `Geçerli type gerekli: ${Object.values(DocumentType).join(", ")}`);
  }

  const doc = await saveUploadedDocument({
    companyId: req.auth!.companyId,
    declarationId: req.params.id!,
    type: typeRaw as DocumentTypeValue,
    file: req.file
  });

  res.status(201).json({ ok: true, data: doc });
}

export async function getDocuments(req: Request, res: Response): Promise<void> {
  const list = await listDocuments(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: list });
}
