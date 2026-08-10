import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import { DeclarationStatus } from "../../common/enums/declarationStatus.js";
import { env } from "../../config/env.js";
import { buildNormalizedDeclaration } from "../normalization/fieldResolver.service.js";
import type { ExtractedSource, NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import {
  validateMandatoryInvoicePresent,
  validateNormalizedDeclaration
} from "../validation/declarationValidator.service.js";
import { generateEvrimXmlDraft } from "../xml/evrimXml.generator.js";
import { extractFromUploaded } from "../extraction/extraction.service.js";
import { DeclarationModel, type DeclarationDoc, type OperationMetaDoc } from "./declaration.model.js";
import { UploadedDocumentModel, type DocumentDoc } from "../documents/document.model.js";
import { toDeclarationDto, type DeclarationDto } from "./declaration.mapper.js";
import type { OperationTypeValue } from "../../common/enums/operationMeta.js";

const REF_PREFIX: Record<string, string> = {
  ihracat: "IHR",
  ithalat: "ITH",
  transit: "TRN",
  antrepo: "ANT"
};

async function generateOperationRef(
  companyId: mongoose.Types.ObjectId,
  operationType: string
): Promise<string> {
  const prefix = REF_PREFIX[operationType] ?? "DCL";
  const year = new Date().getFullYear();
  const count = await DeclarationModel.countDocuments({
    companyId,
    "operation.ref": new RegExp(`^${prefix}-${year}-`)
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

export type CreateDeclarationInput = {
  operation?: Partial<Omit<OperationMetaDoc, "ref" | "receivedAt">> & {
    customerName?: string;
    customerCity?: string;
    customerId?: string;
    operationType?: OperationTypeValue | string;
    fileStatus?: string;
    transportMode?: string | null;
    assigneeName?: string | null;
    lastActivity?: string;
  };
};

export type PatchDeclarationInput = {
  normalizedData?: NormalizedDeclaration;
  status?: string;
  operation?: Partial<OperationMetaDoc>;
};

function toPlainNormalized(doc: DeclarationDoc): NormalizedDeclaration {
  const raw = doc.normalizedData;
  if (raw && typeof raw === "object") {
    return raw as NormalizedDeclaration;
  }
  return {
    header: {},
    parties: {},
    trade: {},
    transport: {},
    packageInfo: {},
    goodsLines: []
  };
}

export async function createDeclaration(
  companyId: mongoose.Types.ObjectId,
  createdBy?: mongoose.Types.ObjectId,
  body?: CreateDeclarationInput
): Promise<DeclarationDto> {
  const opType = body?.operation?.operationType ?? "ihracat";
  const ref = await generateOperationRef(companyId, opType);
  const now = new Date();

  const operation: OperationMetaDoc = {
    ref,
    customerId: body?.operation?.customerId,
    customerName: body?.operation?.customerName?.trim() || "—",
    customerCity: body?.operation?.customerCity?.trim() || "—",
    fileStatus: body?.operation?.fileStatus ?? "yeni-talep",
    operationType: opType,
    isArchived: false,
    transportMode: body?.operation?.transportMode ?? null,
    line: body?.operation?.line ?? null,
    declarationNo: body?.operation?.declarationNo ?? null,
    tescilNo: body?.operation?.tescilNo ?? null,
    assigneeName: body?.operation?.assigneeName ?? null,
    escalation: Boolean(body?.operation?.escalation),
    missingDocuments: body?.operation?.missingDocuments ?? [],
    lastActivity: body?.operation?.lastActivity?.trim() || "Yeni talep oluşturuldu",
    closedAt: null,
    receivedAt: now,
    tescilStatus: null,
    tescilRisk: "",
    hasSecondNotif: false,
    tescilDays: 0,
    kapanisStatus: null,
    tescilDurumu: "",
    kapanicDurumu: "",
    mailRecipient: "",
    mailSubject: "",
    mailBody: ""
  };

  const created = await DeclarationModel.create({
    companyId,
    createdBy,
    status: DeclarationStatus.DRAFT,
    operation
  });
  return toDeclarationDto(created);
}

export async function listDeclarations(companyId: mongoose.Types.ObjectId): Promise<DeclarationDto[]> {
  const rows = await DeclarationModel.find({ companyId }).sort({ updatedAt: -1 }).lean();
  return rows.map((row) => toDeclarationDto(row as unknown as DeclarationDoc));
}

export async function getDeclaration(companyId: mongoose.Types.ObjectId, id: string): Promise<DeclarationDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz beyanname id.");
  const d = await DeclarationModel.findOne({ _id: id, companyId }).lean();
  if (!d) throw new HttpError(404, "Beyanname bulunamadı.");
  return toDeclarationDto(d as unknown as DeclarationDoc);
}

export async function patchDeclaration(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: PatchDeclarationInput
): Promise<DeclarationDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz beyanname id.");

  const existing = await DeclarationModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Beyanname bulunamadı.");

  if (body.normalizedData !== undefined) {
    existing.normalizedData = body.normalizedData as DeclarationDoc["normalizedData"];
  }
  if (body.status !== undefined) {
    if (!Object.values(DeclarationStatus).includes(body.status as (typeof DeclarationStatus)[keyof typeof DeclarationStatus])) {
      throw new HttpError(400, "Geçersiz durum.");
    }
    existing.status = body.status;
  }
  if (body.operation !== undefined) {
    const current = existing.operation
      ? (typeof (existing.operation as { toObject?: () => OperationMetaDoc }).toObject === "function"
          ? (existing.operation as { toObject: () => OperationMetaDoc }).toObject()
          : { ...existing.operation })
      : ({} as Partial<OperationMetaDoc>);
    existing.operation = { ...current, ...body.operation } as OperationMetaDoc;
    existing.markModified("operation");
  }

  if (
    body.normalizedData === undefined &&
    body.status === undefined &&
    body.operation === undefined
  ) {
    throw new HttpError(400, "Güncellenecek alan yok.");
  }

  await existing.save();
  return toDeclarationDto(existing);
}

async function loadDocuments(companyId: mongoose.Types.ObjectId, declarationId: mongoose.Types.ObjectId) {
  return UploadedDocumentModel.find({ companyId, declarationId }).lean();
}

export async function runExtraction(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const dec = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");

  const docs = await loadDocuments(companyId, dec._id);
  const types = docs.map((d) => d.type as DocumentTypeValue);
  const mandatoryErr = validateMandatoryInvoicePresent(types);
  if (mandatoryErr) throw new HttpError(400, mandatoryErr);

  for (const d of docs) {
    const full = await UploadedDocumentModel.findById(d._id);
    if (!full) continue;
    try {
      const extracted = await extractFromUploaded(full);
      full.extractedData = extracted.data;
      full.extractionStatus = "SUCCESS";
      full.parseErrors = [];
      await full.save();
    } catch (e) {
      full.extractionStatus = "FAILED";
      full.parseErrors = [e instanceof Error ? e.message : "Çıkarma hatası"];
      await full.save();
    }
  }

  return UploadedDocumentModel.find({ companyId, declarationId: dec._id }).lean();
}

export async function runNormalize(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const dec = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");

  const docs = await loadDocuments(companyId, dec._id);
  const types = docs.map((d) => d.type as DocumentTypeValue);
  const mandatoryErr = validateMandatoryInvoicePresent(types);
  if (mandatoryErr) throw new HttpError(400, mandatoryErr);

  const sources: ExtractedSource[] = [];
  for (const d of docs) {
    if (d.extractionStatus !== "SUCCESS" || !d.extractedData) continue;
    sources.push({
      type: d.type as ExtractedSource["type"],
      data: d.extractedData as Record<string, unknown>
    });
  }

  const { normalized, sourceTrace } = buildNormalizedDeclaration(sources);
  dec.normalizedData = normalized as DeclarationDoc["normalizedData"];
  dec.sourceTrace = sourceTrace;
  dec.status = DeclarationStatus.READY;
  await dec.save();
  return dec.toObject();
}

export async function runValidate(companyId: mongoose.Types.ObjectId, declarationId: string) {
  const dec = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");
  const data = toPlainNormalized(dec);
  const result = validateNormalizedDeclaration(data);
  return result;
}

export async function runGenerateXml(companyId: mongoose.Types.ObjectId, declarationId: string) {
  const dec = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");

  const validation = validateNormalizedDeclaration(toPlainNormalized(dec));
  if (!validation.ok) {
    dec.status = DeclarationStatus.ERROR;
    await dec.save();
    throw new HttpError(400, validation.errors.join(" "));
  }

  const dir = path.join(env.uploadDir, "xml", String(dec._id));
  await fs.mkdir(dir, { recursive: true });
  const fileName = `beyanname-${Date.now()}.xml`;
  const fullPath = path.join(dir, fileName);
  const xml = generateEvrimXmlDraft(toPlainNormalized(dec));
  await fs.writeFile(fullPath, xml, "utf8");

  dec.generatedXmlPath = fullPath;
  dec.status = DeclarationStatus.XML_GENERATED;
  await dec.save();
  return { path: fullPath, declaration: dec.toObject() };
}

type LeanDeclarationRow = {
  generatedXmlPath?: string;
};

export async function getGeneratedXmlPath(companyId: mongoose.Types.ObjectId, declarationId: string) {
  const dec = (await DeclarationModel.findOne({ _id: declarationId, companyId })
    .lean()
    .exec()) as LeanDeclarationRow | null;
  if (!dec) throw new HttpError(404, "Beyanname bulunamadı.");
  if (!dec.generatedXmlPath) throw new HttpError(404, "Henüz XML üretilmedi.");
  return dec.generatedXmlPath;
}
