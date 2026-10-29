import type { Request, Response } from "express";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { buildMaterialImportWarning, buildMaterialRecordExport, buildMaterialRecordImportTemplate } from "./materialRecordExcel.parser.js";
import {
  bulkCreateMaterialRecords,
  createMaterialRecord,
  deleteMaterialRecord,
  getCustomerRecordCounts,
  importMaterialRecordsFromExcel,
  listMaterialRecords,
  stageMaterialImportUpdates,
  updateMaterialRecord
} from "./materialRecord.service.js";

export async function getRecords(req: Request, res: Response): Promise<void> {
  const customerId = String(req.query.customerId ?? "");
  const data = await listMaterialRecords(req.auth!.operationalCompanyId, customerId);
  res.json({ ok: true, data });
}

export async function getCustomerCounts(req: Request, res: Response): Promise<void> {
  const data = await getCustomerRecordCounts(req.auth!.operationalCompanyId);
  res.json({ ok: true, data });
}

export async function postRecord(req: Request, res: Response): Promise<void> {
  const data = await createMaterialRecord(req.auth!.operationalCompanyId, req.body ?? {});
  res.status(201).json({ ok: true, data });
}

export async function postBulkRecords(req: Request, res: Response): Promise<void> {
  const { customerId, items } = req.body ?? {};
  const data = await bulkCreateMaterialRecords(req.auth!.operationalCompanyId, customerId, items ?? []);
  res.status(201).json({ ok: true, data });
}

export async function patchRecord(req: Request, res: Response): Promise<void> {
  const data = await updateMaterialRecord(req.auth!.operationalCompanyId, req.params.id!, req.body ?? {});
  res.json({ ok: true, data });
}

export async function deleteRecord(req: Request, res: Response): Promise<void> {
  await deleteMaterialRecord(req.auth!.operationalCompanyId, req.params.id!);
  res.json({ ok: true, data: { deleted: true } });
}

export async function postExportExcel(req: Request, res: Response): Promise<void> {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const buffer = buildMaterialRecordExport(rows.map((row: { materialNo?: unknown; description?: unknown; gtipNo?: unknown; status?: unknown; rejectionDetail?: unknown }) => ({
    materialNo: String(row?.materialNo ?? ""),
    description: String(row?.description ?? ""),
    gtipNo: String(row?.gtipNo ?? ""),
    status: String(row?.status ?? ""),
    ...(row?.rejectionDetail !== undefined ? { rejectionDetail: String(row.rejectionDetail) } : {})
  })));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="GTIP_Kayitlari.xlsx"');
  res.send(buffer);
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

export async function postImportUpdates(req: Request, res: Response): Promise<void> {
  const customerId = String(req.body?.customerId ?? "");
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  const data = await stageMaterialImportUpdates(req.auth!.operationalCompanyId, customerId, updates);
  res.json({ ok: true, data });
}

export async function postImportWarning(req: Request, res: Response): Promise<void> {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const buffer = buildMaterialImportWarning(rows.map((row: {
    row?: unknown;
    materialNo?: unknown;
    description?: unknown;
    gtipNo?: unknown;
    differingFields?: unknown;
    currentMaterialNo?: unknown;
    currentDescription?: unknown;
    currentGtipNo?: unknown;
  }) => ({
    row: Number(row?.row ?? 0),
    materialNo: String(row?.materialNo ?? ""),
    description: String(row?.description ?? ""),
    gtipNo: String(row?.gtipNo ?? ""),
    differingFields: Array.isArray(row?.differingFields) ? row.differingFields.map((field) => String(field)) : [],
    currentMaterialNo: String(row?.currentMaterialNo ?? ""),
    currentDescription: String(row?.currentDescription ?? ""),
    currentGtipNo: String(row?.currentGtipNo ?? "")
  })));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="GTIP_Uyari.xlsx"');
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
    req.auth!.operationalCompanyId,
    customerId,
    req.file.buffer
  );
  res.status(data.count > 0 ? 201 : 200).json({ ok: true, data });
}
