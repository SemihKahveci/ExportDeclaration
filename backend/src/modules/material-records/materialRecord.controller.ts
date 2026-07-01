import type { Request, Response } from "express";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { buildMaterialRecordImportTemplate } from "./materialRecordExcel.parser.js";
import {
  bulkCreateMaterialRecords,
  createMaterialRecord,
  deleteMaterialRecord,
  getCustomerRecordCounts,
  importMaterialRecordsFromExcel,
  listMaterialRecords,
  updateMaterialRecord
} from "./materialRecord.service.js";

export async function getRecords(req: Request, res: Response): Promise<void> {
  const customerId = String(req.query.customerId ?? "");
  const data = await listMaterialRecords(req.auth!.companyId, customerId);
  res.json({ ok: true, data });
}

export async function getCustomerCounts(req: Request, res: Response): Promise<void> {
  const data = await getCustomerRecordCounts(req.auth!.companyId);
  res.json({ ok: true, data });
}

export async function postRecord(req: Request, res: Response): Promise<void> {
  const data = await createMaterialRecord(req.auth!.companyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function postBulkRecords(req: Request, res: Response): Promise<void> {
  const { customerId, items } = req.body ?? {};
  const data = await bulkCreateMaterialRecords(req.auth!.companyId, customerId, items ?? []);
  res.status(201).json({ ok: true, data });
}

export async function patchRecord(req: Request, res: Response): Promise<void> {
  const data = await updateMaterialRecord(req.auth!.companyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteRecord(req: Request, res: Response): Promise<void> {
  await deleteMaterialRecord(req.auth!.companyId, req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function getImportTemplate(_req: Request, res: Response): Promise<void> {
  const buffer = buildMaterialRecordImportTemplate();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="GTIP_Yukle_Sablon.xlsx"');
  res.send(buffer);
}

export async function postImportExcel(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new HttpError(
      400,
      "Excel dosyası seçilmedi. Lütfen .xlsx veya .xls formatında bir dosya seçin."
    );
  }

  const customerId = String(req.body?.customerId ?? "");
  const data = await importMaterialRecordsFromExcel(
    req.auth!.companyId,
    customerId,
    req.file.buffer
  );
  res.status(201).json({ ok: true, data });
}
