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
import { DeclarationModel, type DeclarationDoc, type OperationMetaDoc } from "./declaration.model.js";
import { UploadedDocumentModel, type DocumentDoc } from "../documents/document.model.js";
import { ProcessingRunModel } from "../idp/domain/processingRun.model.js";
import { HumanReviewDecisionModel } from "../idp/domain/humanReviewDecision.model.js";
import { buildHumanReviewIssues } from "../idp/review/humanReview.service.js";
import { buildEffectiveInvoiceGoodsLines, buildEffectiveInvoiceShipmentInfo, buildEffectiveInvoiceHeaderParty, buildEffectiveInvoiceCommercialTerms } from "../idp/normalization/effectiveInvoiceNormalizer.js";
import { discoverInvoiceShipmentFieldCandidates } from "../idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceOriginFieldCandidates } from "../idp/candidates/invoiceOriginCandidateDiscovery.js";
import type { GenericInvoiceCandidateAudit } from "../idp/domain/genericCandidateIntegration.types.js";
import { ProcessingStatus } from "../idp/domain/idp.types.js";
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

    // Upload already creates an immutable ProcessingRun. Never parse/OCR the
    // physical PDF again from the declaration action; consume the latest IDP run.
    const run = await ProcessingRunModel.findOne({
      companyId,
      declarationId: dec._id,
      uploadedFileId: full._id
    }).sort({ createdAt: -1 });

    if (!run) {
      full.extractionStatus = "PENDING";
      full.parseErrors = ["IDP processing run bulunamadı; dosyayı processing kuyruğuna alın."];
    } else if (run.status === ProcessingStatus.COMPLETED) {
      full.extractedData = run.finalResult ?? run.rawExtraction ?? {};
      full.extractionStatus = "SUCCESS";
      full.parseErrors = [];
    } else if (run.status === ProcessingStatus.FAILED) {
      full.extractionStatus = "FAILED";
      full.parseErrors = [run.error?.message ?? "IDP processing başarısız."];
    } else {
      full.extractionStatus = "PENDING";
      full.parseErrors = [`IDP processing henüz tamamlanmadı (${run.status}).`];
    }
    await full.save();
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

  // Foundation 5.4: invoice goods lines are promoted from the canonical generic
  // candidate path. Legacy extractedData remains available for non-migrated
  // header/document fields, but it is no longer authoritative for invoice rows.
  const invoiceDocs = docs.filter(d => d.type === "INVOICE");
  let genericGoodsPromoted = false;
  for (const invoiceDoc of invoiceDocs) {
    const run = await ProcessingRunModel.findOne({
      companyId,
      declarationId: dec._id,
      uploadedFileId: invoiceDoc._id,
      status: ProcessingStatus.COMPLETED
    }).sort({ createdAt: -1 }).lean();
    if (!run) continue;

    const segments = (run.candidates as any)?.segments;
    const audit = Array.isArray(segments)
      ? segments.map((segment: any) => segment?.data?.genericCandidateAudit as GenericInvoiceCandidateAudit | undefined).find(Boolean)
      : undefined;
    if (!audit) continue;

    // Foundation 5.5A.4: old completed runs predate persisted origin candidates.
    // Derive them from persisted canonical + generic goods evidence without OCR/reparse.
    const segmentId = String((segments?.[0] as any)?.segmentId ?? "invoice");
    const originFields = audit.originCandidates ?? discoverInvoiceOriginFieldCandidates(
      run.canonicalDocument as any,
      segmentId,
      audit.candidates
    );
    const effectiveAuditForReview: GenericInvoiceCandidateAudit = {
      ...audit,
      originCandidates: originFields,
      candidates: {
        ...audit.candidates,
        fields: { ...audit.candidates.fields, ...originFields.fields }
      }
    };

    const issues = buildHumanReviewIssues({ ...run, candidates: {
      ...(run.candidates as any),
      segments: (segments as any[]).map((segment: any) =>
        segment?.data?.genericCandidateAudit === audit
          ? { ...segment, data: { ...segment.data, genericCandidateAudit: effectiveAuditForReview } }
          : segment
      )
    }});
    const decisions = await HumanReviewDecisionModel.find({ companyId, processingRunId: run._id }).sort({ createdAt: 1 }).lean();
    const decidedIssueIds = new Set(decisions.map(decision => decision.issueId));
    const pendingIssues = issues.filter(issue => !decidedIssueIds.has(issue.issueId));
    if (pendingIssues.length) {
      throw new HttpError(409, `IDP human review tamamlanmadan normalize edilemez (${pendingIssues.length} bekleyen issue).`);
    }
    if (!audit.migration.promotable && issues.length === 0) {
      throw new HttpError(409, `Generic invoice sonucu promotion için hazır değil: ${audit.migration.promotion.reasons.join(", ") || "REVIEW_REQUIRED"}.`);
    }

    try {
      // Foundation 5.5A: package/shipment metadata is canonical evidence too.
      // Older completed runs predate these candidates; derive only the missing
      // document-level fields from the persisted canonical document so OCR and
      // extraction never need to run again. Future runs already persist them.
      const shipmentFields = audit.shipmentCandidates ?? discoverInvoiceShipmentFieldCandidates(run.canonicalDocument as any, segmentId);
      const effectiveAudit: GenericInvoiceCandidateAudit = {
        ...effectiveAuditForReview,
        candidates: {
          ...effectiveAuditForReview.candidates,
          fields: { ...effectiveAuditForReview.candidates.fields, ...shipmentFields.fields }
        }
      };
      const headerPartyFields = audit.headerPartyCandidates ?? discoverInvoiceHeaderPartyFieldCandidates(run.canonicalDocument as any, segmentId);
      effectiveAudit.candidates.fields = { ...effectiveAudit.candidates.fields, ...headerPartyFields.fields };
      const commercialTermsFields = audit.commercialTermsCandidates ?? discoverInvoiceCommercialTermsFieldCandidates(run.canonicalDocument as any, segmentId);
      effectiveAudit.candidates.fields = { ...effectiveAudit.candidates.fields, ...commercialTermsFields.fields };
      const headerParty = buildEffectiveInvoiceHeaderParty(effectiveAudit, decisions);
      normalized.header = { ...normalized.header, ...headerParty.data.header };
      normalized.parties = { ...normalized.parties, ...headerParty.data.parties };
      for (const [field, trace] of Object.entries(headerParty.trace)) {
        (sourceTrace as Record<string, any>)[field] = { ...trace, processingRunId: String(run._id), uploadedFileId: String(invoiceDoc._id) };
      }

      const commercialTerms = buildEffectiveInvoiceCommercialTerms(effectiveAudit, decisions);
      normalized.header = { ...normalized.header, ...commercialTerms.data.header };
      normalized.trade = { ...normalized.trade, ...commercialTerms.data.trade };
      normalized.transport = { ...normalized.transport, ...commercialTerms.data.transport };
      for (const [field, trace] of Object.entries(commercialTerms.trace)) {
        (sourceTrace as Record<string, any>)[field] = { ...trace, processingRunId: String(run._id), uploadedFileId: String(invoiceDoc._id) };
      }

      const shipment = buildEffectiveInvoiceShipmentInfo(effectiveAudit, decisions);
      normalized.packageInfo = { ...normalized.packageInfo, ...shipment.packageInfo };
      for (const [field, trace] of Object.entries(shipment.trace)) {
        (sourceTrace as Record<string, any>)[field] = { ...trace, processingRunId: String(run._id), uploadedFileId: String(invoiceDoc._id) };
      }

      const effective = buildEffectiveInvoiceGoodsLines(effectiveAudit, decisions);
      if (!genericGoodsPromoted) {
        normalized.goodsLines = [];
        genericGoodsPromoted = true;
      }
      const rowOffset = normalized.goodsLines.length;
      normalized.goodsLines.push(...effective.goodsLines.map((line, index) => ({ ...line, lineNo: rowOffset + index + 1 })));
      for (const [field, trace] of Object.entries(effective.trace)) {
        const match = /^goodsLines\.(\d+)\.(.+)$/.exec(field);
        const targetField = match ? `goodsLines.${rowOffset + Number(match[1])}.${match[2]}` : field;
        (sourceTrace as Record<string, any>)[targetField] = {
          ...trace,
          processingRunId: String(run._id),
          uploadedFileId: String(invoiceDoc._id)
        };
      }
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : "Generic invoice normalization tamamlanamadı.");
    }
  }

  if (genericGoodsPromoted) {
    (sourceTrace as Record<string, any>)["goodsLines"] = {
      value: normalized.goodsLines,
      source: "IDP_GENERIC",
      provenance: "CANONICAL_CANDIDATES_WITH_HUMAN_REVIEW_OVERLAY"
    };
  }

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
