import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  MaterialRecordModel,
  RECORD_STATUSES,
  TRANSACTION_TYPES,
  type MaterialRecordDoc
} from "./materialRecord.model.js";
import { toMaterialRecordDto, type MaterialRecordDto } from "./materialRecord.mapper.js";
import {
  parseMaterialRecordExcel,
  type MaterialExcelRowError
} from "./materialRecordExcel.parser.js";

export type CreateMaterialRecordInput = Omit<MaterialRecordDto, "id" | "updatedAt">;

function assertTransactionTypes(types: unknown): string[] {
  if (!Array.isArray(types) || types.length === 0) {
    return [...TRANSACTION_TYPES];
  }
  for (const t of types) {
    if (typeof t !== "string" || !TRANSACTION_TYPES.includes(t as (typeof TRANSACTION_TYPES)[number])) {
      throw new HttpError(400, `Geçersiz işlem tipi: ${String(t)}`);
    }
  }
  return types as string[];
}

function assertStatus(v: unknown): MaterialRecordDoc["status"] {
  if (v === "verified" || v === "pending" || v === "rejected") return v;
  return "pending";
}

function assertSource(v: unknown): MaterialRecordDoc["source"] {
  if (v === "manuel" || v === "fatura") return v;
  return "manuel";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertUniqueMaterialNo(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  materialNo: string,
  excludeId?: string
): Promise<void> {
  const key = materialNo.trim().toLocaleLowerCase("tr-TR");
  const rows = await MaterialRecordModel.find({ companyId, customerId }).select("_id materialNo");
  const duplicate = rows.find((row) => {
    if (excludeId && String(row._id) === String(excludeId)) return false;
    return row.materialNo.trim().toLocaleLowerCase("tr-TR") === key;
  });
  if (duplicate) {
    throw new HttpError(
      409,
      `Bu müşteri için malzeme numarası zaten kayıtlı: ${materialNo}`
    );
  }
}

export async function listMaterialRecords(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<MaterialRecordDto[]> {
  if (!customerId.trim()) throw new HttpError(400, "customerId gerekli.");
  const rows = await MaterialRecordModel.find({ companyId, customerId }).sort({ updatedAt: -1 });
  return rows.map(toMaterialRecordDto);
}

export async function getCustomerRecordCounts(
  companyId: mongoose.Types.ObjectId
): Promise<Array<{ customerId: string; recordCount: number }>> {
  const rows = await MaterialRecordModel.aggregate<{ _id: string; recordCount: number }>([
    { $match: { companyId } },
    { $group: { _id: "$customerId", recordCount: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map((r) => ({ customerId: r._id, recordCount: r.recordCount }));
}

export async function createMaterialRecord(
  companyId: mongoose.Types.ObjectId,
  body: CreateMaterialRecordInput
): Promise<MaterialRecordDto> {
  if (!body.customerId?.trim()) throw new HttpError(400, "customerId gerekli.");
  if (!body.materialNo?.trim()) throw new HttpError(400, "Malzeme no gerekli.");
  if (!body.description?.trim()) throw new HttpError(400, "Tanım gerekli.");
  if (!body.gtipNo?.trim()) throw new HttpError(400, "GTİP no gerekli.");

  const customerId = body.customerId.trim();
  const materialNo = body.materialNo.trim();
  await assertUniqueMaterialNo(companyId, customerId, materialNo);

  const created = await MaterialRecordModel.create({
    companyId,
    customerId,
    materialNo,
    description: body.description.trim(),
    gtipNo: body.gtipNo.trim(),
    transactionTypes: assertTransactionTypes(body.transactionTypes),
    status: assertStatus(body.status),
    source: assertSource(body.source)
  }).catch((error: { code?: number }) => {
    if (error?.code === 11000) {
      throw new HttpError(409, `Bu müşteri için malzeme numarası zaten kayıtlı: ${materialNo}`);
    }
    throw error;
  });
  return toMaterialRecordDto(created);
}

export async function bulkCreateMaterialRecords(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  items: Omit<CreateMaterialRecordInput, "customerId">[]
): Promise<MaterialRecordDto[]> {
  if (!customerId.trim()) throw new HttpError(400, "customerId gerekli.");
  if (!items.length) throw new HttpError(400, "En az bir kayıt gerekli.");

  const seen = new Set<string>();
  for (const item of items) {
    const materialNo = item.materialNo.trim();
    const key = materialNo.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) {
      throw new HttpError(409, `Bu müşteri için malzeme numarası zaten kayıtlı: ${materialNo}`);
    }
    seen.add(key);
    await assertUniqueMaterialNo(companyId, customerId.trim(), materialNo);
  }

  const docs = items.map((item) => ({
    companyId,
    customerId: customerId.trim(),
    materialNo: item.materialNo.trim(),
    description: item.description.trim(),
    gtipNo: item.gtipNo.trim(),
    transactionTypes: assertTransactionTypes(item.transactionTypes),
    status: assertStatus(item.status ?? "pending"),
    source: assertSource(item.source ?? "fatura")
  }));

  const created = await MaterialRecordModel.insertMany(docs);
  return created.map((doc) => toMaterialRecordDto(doc as MaterialRecordDoc));
}

export async function updateMaterialRecord(
  companyId: mongoose.Types.ObjectId,
  id: string,
  patch: Partial<Pick<CreateMaterialRecordInput, "status" | "materialNo" | "description" | "gtipNo" | "transactionTypes">>
): Promise<MaterialRecordDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kayıt id.");

  const update: Record<string, unknown> = {};
  if (patch.materialNo !== undefined) update.materialNo = patch.materialNo.trim();
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.gtipNo !== undefined) update.gtipNo = patch.gtipNo.trim();
  if (patch.transactionTypes !== undefined) {
    update.transactionTypes = assertTransactionTypes(patch.transactionTypes);
  }
  if (patch.status !== undefined) {
    if (!RECORD_STATUSES.includes(patch.status as (typeof RECORD_STATUSES)[number])) {
      throw new HttpError(400, "Geçersiz durum.");
    }
    update.status = patch.status;
  }

  if (Object.keys(update).length === 0) {
    throw new HttpError(400, "Güncellenecek alan yok.");
  }

  if (typeof update.materialNo === "string") {
    const current = await MaterialRecordModel.findOne({ _id: id, companyId }).select("customerId");
    if (!current) throw new HttpError(404, "Kayıt bulunamadı.");
    await assertUniqueMaterialNo(companyId, current.customerId, update.materialNo, id);
  }

  const updated = await MaterialRecordModel.findOneAndUpdate(
    { _id: id, companyId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!updated) throw new HttpError(404, "Kayıt bulunamadı.");
  return toMaterialRecordDto(updated);
}

export async function deleteMaterialRecord(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kayıt id.");
  const deleted = await MaterialRecordModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Kayıt bulunamadı.");
}

export interface MaterialRecordImportResult {
  records: MaterialRecordDto[];
  count: number;
  errors: MaterialExcelRowError[];
}

export async function importMaterialRecordsFromExcel(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  buffer: Buffer
): Promise<MaterialRecordImportResult> {
  if (!customerId.trim()) throw new HttpError(400, "customerId gerekli.");

  const parsed = parseMaterialRecordExcel(buffer);
  const errors = [...parsed.errors];
  const records: MaterialRecordDto[] = [];

  if (parsed.items.length === 0 && errors.length === 0) {
    throw new HttpError(400, "Excel dosyasında içe aktarılacak veri yok.");
  }

  for (const { row, item } of parsed.items) {
    const existing = await MaterialRecordModel.findOne({
      companyId,
      customerId: customerId.trim(),
      materialNo: { $regex: `^${escapeRegex(item.materialNo)}$`, $options: "i" }
    }).select("_id");

    if (existing) {
      errors.push({
        row,
        message: `Bu malzeme numarası zaten mevcut: ${item.materialNo}`
      });
      continue;
    }

    try {
      const created = await MaterialRecordModel.create({
        companyId,
        customerId: customerId.trim(),
        materialNo: item.materialNo,
        description: item.description,
        gtipNo: item.gtipNo,
        transactionTypes: [...TRANSACTION_TYPES],
        status: "pending",
        source: "fatura"
      });
      records.push(toMaterialRecordDto(created));
    } catch (error) {
      errors.push({
        row,
        message: error instanceof Error ? error.message : "Kayıt eklenemedi."
      });
    }
  }

  if (records.length === 0 && errors.length === 0) {
    throw new HttpError(400, "Hiçbir malzeme kaydı eklenemedi.");
  }

  return { records, count: records.length, errors };
}
