import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { MaterialRecordModel, TRANSACTION_TYPES } from "../material-records/materialRecord.model.js";
import type { GtipQueryResultDto } from "./gtipQuery.mapper.js";
import {
  GtipQuerySessionModel,
  QUERY_APPROVAL_STATUSES,
  QUERY_RESULT_STATUSES,
  type GtipQueryItemDoc
} from "./gtipQuerySession.model.js";

export interface StoredGtipQueryDto {
  customerId: string;
  customerName: string;
  fileName: string;
  pdfType: string;
  itemCount: number;
  results: GtipQueryResultDto[];
}

export interface SaveGtipQueryInput {
  customerId?: string;
  customerName?: string;
  fileName?: string;
  pdfType?: string;
  results: Array<{
    materialNo: string;
    description: string;
    foundGtip: string;
    status: GtipQueryResultDto["status"];
    approvalStatus: GtipQueryResultDto["approvalStatus"];
  }>;
}

export interface SendToApprovalInput {
  customerId: string;
  results?: SaveGtipQueryInput["results"];
}

export interface SendToApprovalResult {
  sent: number;
  skipped: number;
  skippedDuplicates: number;
  skippedExisting: number;
}

function emptyStored(): StoredGtipQueryDto {
  return {
    customerId: "",
    customerName: "",
    fileName: "",
    pdfType: "",
    itemCount: 0,
    results: []
  };
}

function toResultDto(item: GtipQueryItemDoc): GtipQueryResultDto {
  return {
    id: String(item._id),
    materialNo: item.materialNo,
    description: item.description,
    foundGtip: item.foundGtip,
    status: item.status,
    approvalStatus: item.approvalStatus
  };
}

function toStoredDto(doc: {
  customerId: string;
  customerName?: string;
  fileName?: string;
  pdfType?: string;
  items: GtipQueryItemDoc[];
}): StoredGtipQueryDto {
  const results = (doc.items ?? []).map(toResultDto);
  return {
    customerId: doc.customerId ?? "",
    customerName: doc.customerName ?? "",
    fileName: doc.fileName ?? "",
    pdfType: doc.pdfType ?? "",
    itemCount: results.length,
    results
  };
}

function normalizeItems(results: SaveGtipQueryInput["results"]) {
  return results.map((item, index) => {
    const materialNo = item.materialNo?.trim();
    const description = item.description?.trim();
    if (!materialNo) throw new HttpError(400, `Malzeme no gerekli (satır ${index + 1}).`);
    if (!description) throw new HttpError(400, `Tanım gerekli (satır ${index + 1}).`);
    if (!QUERY_RESULT_STATUSES.includes(item.status)) {
      throw new HttpError(400, "Geçersiz sorgu durumu.");
    }
    if (!QUERY_APPROVAL_STATUSES.includes(item.approvalStatus)) {
      throw new HttpError(400, "Geçersiz onay durumu.");
    }
    return {
      materialNo,
      description,
      foundGtip: item.foundGtip?.trim() || "—",
      status: item.status,
      approvalStatus: item.approvalStatus
    };
  });
}

export async function getStoredGtipQuery(
  companyId: mongoose.Types.ObjectId
): Promise<StoredGtipQueryDto> {
  const doc = await GtipQuerySessionModel.findOne({ companyId });
  if (!doc) return emptyStored();
  return toStoredDto(doc);
}

export async function saveStoredGtipQuery(
  companyId: mongoose.Types.ObjectId,
  body: SaveGtipQueryInput
): Promise<StoredGtipQueryDto> {
  if (!body.results?.length) throw new HttpError(400, "Kaydedilecek sorgu sonucu yok.");
  const items = normalizeItems(body.results);

  const doc = await GtipQuerySessionModel.findOneAndUpdate(
    { companyId },
    {
      $set: {
        customerId: body.customerId?.trim() ?? "",
        customerName: body.customerName?.trim() ?? "",
        fileName: body.fileName?.trim() ?? "",
        pdfType: body.pdfType?.trim() ?? "",
        items
      },
      $setOnInsert: { companyId }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!doc) throw new HttpError(500, "Sorgu sonuçları kaydedilemedi.");
  return toStoredDto(doc);
}

export async function sendStoredGtipQueryToApproval(
  companyId: mongoose.Types.ObjectId,
  body: SendToApprovalInput
): Promise<SendToApprovalResult> {
  const customerId = body.customerId?.trim();
  if (!customerId) throw new HttpError(400, "Müşteri gerekli.");

  const session = await GtipQuerySessionModel.findOne({ companyId });
  const sourceItems = body.results?.length
    ? normalizeItems(body.results)
    : (session?.items ?? []).map((item) => ({
        materialNo: item.materialNo,
        description: item.description,
        foundGtip: item.foundGtip,
        status: item.status,
        approvalStatus: item.approvalStatus
      }));

  if (!sourceItems.length) {
    throw new HttpError(400, "Onaya gönderilecek sorgu sonucu yok.");
  }

  const existing = await MaterialRecordModel.find({ companyId, customerId }).select("materialNo");
  const existingKeys = new Set(
    existing.map((row) => row.materialNo.trim().toLocaleLowerCase("tr-TR"))
  );

  const seen = new Set<string>();
  let skippedDuplicates = 0;
  let skippedExisting = 0;
  const toCreate: Array<{
    companyId: mongoose.Types.ObjectId;
    customerId: string;
    materialNo: string;
    description: string;
    gtipNo: string;
    transactionTypes: string[];
    status: "pending";
    source: "fatura";
  }> = [];

  for (const item of sourceItems) {
    const materialNo = item.materialNo.trim();
    const key = materialNo.toLocaleLowerCase("tr-TR");
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    toCreate.push({
      companyId,
      customerId,
      materialNo,
      description: item.description.trim() || "—",
      gtipNo: item.foundGtip?.trim() || "—",
      transactionTypes: [...TRANSACTION_TYPES],
      status: "pending",
      source: "fatura"
    });
  }

  if (toCreate.length > 0) {
    await MaterialRecordModel.insertMany(toCreate);
  }

  await GtipQuerySessionModel.deleteOne({ companyId });

  return {
    sent: toCreate.length,
    skipped: skippedDuplicates + skippedExisting,
    skippedDuplicates,
    skippedExisting
  };
}
