import type { Request, Response } from "express";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { parseInvoicePdfForGtipQuery } from "./gtipQuery.service.js";
import {
  getStoredGtipQuery,
  saveStoredGtipQuery,
  sendStoredGtipQueryToApproval
} from "./gtipQueryResults.service.js";

export async function postParseInvoice(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new HttpError(400, "PDF dosyası gerekli (alan adı: file).");
  }

  const data = await parseInvoicePdfForGtipQuery(req.file);
  res.status(200).json({ ok: true, data });
}

export async function getResults(req: Request, res: Response): Promise<void> {
  const data = await getStoredGtipQuery(req.auth!.companyId);
  res.status(200).json({ ok: true, data });
}

export async function putResults(req: Request, res: Response): Promise<void> {
  const data = await saveStoredGtipQuery(req.auth!.companyId, req.body ?? {});
  res.status(200).json({ ok: true, data });
}

export async function postSendToApproval(req: Request, res: Response): Promise<void> {
  const data = await sendStoredGtipQueryToApproval(req.auth!.companyId, req.body ?? {});
  res.status(200).json({ ok: true, data });
}
