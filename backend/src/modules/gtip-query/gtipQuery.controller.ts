import type { Request, Response } from "express";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { parseInvoicePdfForGtipQuery } from "./gtipQuery.service.js";

export async function postParseInvoice(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new HttpError(400, "PDF dosyası gerekli (alan adı: file).");
  }

  const data = await parseInvoicePdfForGtipQuery(req.file);
  res.status(200).json({ ok: true, data });
}
