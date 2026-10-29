import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  MATERIAL_FIELD_KEYS,
  MaterialRecordModel,
  RECORD_STATUSES,
  TRANSACTION_TYPES,
  type MaterialRecordDoc
} from "./materialRecord.model.js";
import { classifyMaterialImportRows, type MaterialImportConflict } from "./materialRecordImport.js";
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

export interface MaterialRecordPatch {
  status?: CreateMaterialRecordInput["status"];
  materialNo?: string;
  description?: string;
  gtipNo?: string;
  transactionTypes?: CreateMaterialRecordInput["transactionTypes"];
  rejection?: { fields?: string[]; note?: string };
}

function rejectionFields(value: unknown): Array<(typeof MATERIAL_FIELD_KEYS)[number]> {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(MATERIAL_FIELD_KEYS);
  const fields = value.filter((field): field is (typeof MATERIAL_FIELD_KEYS)[number] => (
    typeof field === "string" && allowed.has(field)
  ));
  return [...new Set(fields)];
}

export async function updateMaterialRecord(
  companyId: mongoose.Types.ObjectId,
  id: string,
  patch: MaterialRecordPatch
): Promise<MaterialRecordDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kayıt id.");
  const current = await MaterialRecordModel.findOne({ _id: id, companyId });
  if (!current) throw new HttpError(404, "Kayıt bulunamadı.");

  if (patch.status !== undefined && !RECORD_STATUSES.includes(patch.status)) {
    throw new HttpError(400, "Geçersiz durum.");
  }

  if (patch.status === "rejected") {
    const fields = rejectionFields(patch.rejection?.fields);
    if (fields.length === 0) throw new HttpError(400, "Reddetmek için en az bir alan seçilmelidir.");
    const updated = await MaterialRecordModel.findOneAndUpdate(
      { _id: id, companyId },
      { $set: { status: "rejected", rejection: { fields, note: String(patch.rejection?.note ?? "").trim() } } },
      { new: true, runValidators: true }
    );
    if (!updated) throw new HttpError(404, "Kayıt bulunamadı.");
    return toMaterialRecordDto(updated);
  }

  if (patch.status === "verified" && current.pendingUpdate) {
    const proposed = current.pendingUpdate;
    await assertUniqueMaterialNo(companyId, current.customerId, proposed.materialNo, id);
    const updated = await MaterialRecordModel.findOneAndUpdate(
      { _id: id, companyId },
      {
        $set: {
          materialNo: proposed.materialNo,
          description: proposed.description,
          gtipNo: proposed.gtipNo,
          status: "verified"
        },
        $unset: { pendingUpdate: "", rejection: "" }
      },
      { new: true, runValidators: true }
    );
    if (!updated) throw new HttpError(404, "Kayıt bulunamadı.");
    return toMaterialRecordDto(updated);
  }

  if (current.pendingUpdate && patch.status !== "verified") {
    const proposed = {
      materialNo: patch.materialNo?.trim() || current.pendingUpdate.materialNo,
      description: patch.description?.trim() || current.pendingUpdate.description,
      gtipNo: patch.gtipNo?.trim() || current.pendingUpdate.gtipNo
    };
    const $set: Record<string, unknown> = { pendingUpdate: proposed };
    if (patch.status) $set.status = patch.status;
    if (patch.transactionTypes !== undefined) $set.transactionTypes = assertTransactionTypes(patch.transactionTypes);
    const updated = await MaterialRecordModel.findOneAndUpdate(
      { _id: id, companyId },
      patch.status === "pending" || !patch.status
        ? { $set, $unset: { rejection: "" } }
        : { $set },
      { new: true, runValidators: true }
    );
    if (!updated) throw new HttpError(404, "Kayıt bulunamadı.");
    return toMaterialRecordDto(updated);
  }

  const update: Record<string, unknown> = {};
  if (patch.materialNo !== undefined) update.materialNo = patch.materialNo.trim();
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.gtipNo !== undefined) update.gtipNo = patch.gtipNo.trim();
  if (patch.transactionTypes !== undefined) update.transactionTypes = assertTransactionTypes(patch.transactionTypes);
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) throw new HttpError(400, "Güncellenecek alan yok.");
  if (typeof update.materialNo === "string") {
    await assertUniqueMaterialNo(companyId, current.customerId, update.materialNo, id);
  }
  const unset = patch.status === "pending" || patch.status === "verified" ? { rejection: "" } : undefined;
  const updated = await MaterialRecordModel.findOneAndUpdate(
    { _id: id, companyId },
    unset ? { $set: update, $unset: unset } : { $set: update },
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
  conflicts: MaterialImportConflict[];
  skippedIdentical: number;
}

export async function importMaterialRecordsFromExcel(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  buffer: Buffer
): Promise<MaterialRecordImportResult> {
  if (!customerId.trim()) throw new HttpError(400, "customerId gerekli.");

  const parsed = parseMaterialRecordExcel(buffer);
  const errors = [...parsed.errors];

  if (parsed.items.length === 0 && errors.length === 0) {
    throw new HttpError(400, "Excel dosyasında içe aktarılacak veri yok.");
  }

  const stored = await MaterialRecordModel.find({ companyId, customerId: customerId.trim() });
  const classified = classifyMaterialImportRows(
    parsed.items,
    stored.map((row) => ({
      id: String(row._id),
      materialNo: row.materialNo,
      description: row.description,
      gtipNo: row.gtipNo
    }))
  );
  errors.push(...classified.errors);
  const records: MaterialRecordDto[] = [];

  for (const { row, item } of classified.create) {
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

  return {
    records,
    count: records.length,
    errors,
    conflicts: classified.conflicts,
    skippedIdentical: classified.skippedIdentical
  };
}

export async function stageMaterialImportUpdates(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  updates: Array<{ id?: string; materialNo?: string; description?: string; gtipNo?: string }>
): Promise<MaterialRecordDto[]> {
  if (!customerId.trim()) throw new HttpError(400, "customerId gerekli.");
  if (!updates.length) throw new HttpError(400, "Güncellenecek satır yok.");
  const staged: MaterialRecordDto[] = [];
  for (const update of updates) {
    const id = String(update.id ?? "");
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kayıt id.");
    const materialNo = String(update.materialNo ?? "").trim();
    const description = String(update.description ?? "").trim();
    const gtipNo = String(update.gtipNo ?? "").trim();
    if (!materialNo || !description || !gtipNo) throw new HttpError(400, "Malzeme no, tanım ve GTİP dolu olmalıdır.");
    const current = await MaterialRecordModel.findOne({ _id: id, companyId, customerId: customerId.trim() });
    if (!current) throw new HttpError(404, "Kayıt bulunamadı.");
    await assertUniqueMaterialNo(companyId, current.customerId, materialNo, id);
    const updated = await MaterialRecordModel.findOneAndUpdate(
      { _id: id, companyId },
      {
        $set: { status: "pending", pendingUpdate: { materialNo, description, gtipNo } },
        $unset: { rejection: "" }
      },
      { new: true, runValidators: true }
    );
    if (!updated) throw new HttpError(404, "Kayıt bulunamadı.");
    staged.push(toMaterialRecordDto(updated));
  }
  return staged;
}
