import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "./declarationFieldResolution.model.js";
import type { ResolvedDeclarationField } from "./declarationFieldResolution.types.js";

export const DEFAULT_DECLARATION_FIELD_TARGETS: Readonly<Record<string, string>> = {
  invoiceNo: "header.invoiceNo",
  invoiceDate: "header.invoiceDate",
  currency: "header.currency",
  totalAmount: "header.totalAmount",
  deliveryTerm: "trade.deliveryTerm",
  paymentType: "trade.paymentType",
  originCountry: "trade.origin",
  transportMode: "transport.mode",
  totalPackage: "packageInfo.totalPackage",
  packageType: "packageInfo.packageType",
  grossWeight: "packageInfo.grossKg",
  netWeight: "packageInfo.netKg"
};

type MutableObject = Record<string, unknown>;

const GOODS_LINE_FIELD_RE = /^goodsLines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal|origin|grossKg|netKg)$/;

function dynamicGoodsLineTarget(fieldName: string): string | undefined {
  const match = GOODS_LINE_FIELD_RE.exec(fieldName);
  if (!match) return undefined;
  return `goodsLines.${Number(match[1])}.${match[2]}`;
}

function setByPath(target: MutableObject, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("Promotion target path is empty.");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const current = cursor[key];
    if (current === undefined || current === null) cursor[key] = {};
    else if (typeof current !== "object" || Array.isArray(current)) throw new Error(`Promotion target path collides at ${key}.`);
    cursor = cursor[key] as MutableObject;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function setGoodsLineByPath(target: MutableObject, path: string, value: unknown): void {
  const match = GOODS_LINE_FIELD_RE.exec(path);
  if (!match) throw new Error(`Invalid goods-line promotion target: ${path}.`);
  const index = Number(match[1]);
  const field = match[2]!;
  const existing = target.goodsLines;
  if (existing !== undefined && !Array.isArray(existing)) throw new Error("Promotion target path collides at goodsLines.");
  const goodsLines = (existing ?? []) as unknown[];
  target.goodsLines = goodsLines;
  const current = goodsLines[index];
  if (current === undefined || current === null) goodsLines[index] = {};
  else if (typeof current !== "object" || Array.isArray(current)) throw new Error(`Promotion target path collides at goodsLines.${index}.`);
  (goodsLines[index] as MutableObject)[field] = value;
}

function setPromotionValue(target: MutableObject, path: string, value: unknown): void {
  if (GOODS_LINE_FIELD_RE.test(path)) {
    setGoodsLineByPath(target, path, value);
    return;
  }
  setByPath(target, path, value);
}

function clonePromotionValue(value: unknown): unknown {
  // structuredClone() does not preserve BSON ObjectId instances. In particular,
  // Mongoose adds _id to normalizedData.goodsLines subdocuments after the first
  // promotion; structuredClone turns those ObjectIds into plain { buffer }
  // objects and a replay then fails Mongoose casting on save. Preserve BSON and
  // Date values explicitly while still detaching the mutable promotion snapshot.
  if (value instanceof mongoose.Types.ObjectId) return new mongoose.Types.ObjectId(value.toHexString());
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((entry) => clonePromotionValue(entry));
  if (value && typeof value === "object") {
    const clone: MutableObject = {};
    for (const [key, entry] of Object.entries(value as MutableObject)) clone[key] = clonePromotionValue(entry);
    return clone;
  }
  return value;
}

function cloneObject(value: unknown): MutableObject {
  const clone = clonePromotionValue(value);
  if (!clone || typeof clone !== "object" || Array.isArray(clone)) return {};
  return clone as MutableObject;
}

function assertPromotable(field: ResolvedDeclarationField): asserts field is ResolvedDeclarationField & {
  status: "RESOLVED";
  selectedCandidate: NonNullable<ResolvedDeclarationField["selectedCandidate"]>;
} {
  if (field.status !== "RESOLVED") throw new Error("Only RESOLVED fields may be promoted.");
  if (!field.selectedCandidate) throw new Error(`Resolved field ${field.field} has no selected candidate provenance.`);
  if (field.selectedCandidate.candidateId !== field.selectedCandidateId) throw new Error(`Resolved field ${field.field} selected-candidate mismatch.`);
}

/**
 * Promotes only the current persisted RESOLVED snapshot into normalizedData.
 * REVIEW_REQUIRED fields never write a declaration value. Every promoted target
 * receives sourceTrace that points back to the immutable resolution run and the
 * selected candidate/evidence chain.
 */
export async function promotePersistedDeclarationFieldResolution(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  resolutionRunId: mongoose.Types.ObjectId | string;
  fieldTargets?: Readonly<Record<string, string>>;
}) {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId });
  if (!declaration) throw new Error("Declaration not found in company scope.");
  if (!declaration.idpResolution) throw new Error("Declaration has no persisted IDP resolution snapshot.");
  if (String(declaration.idpResolution.resolutionRunId) !== String(params.resolutionRunId)) {
    throw new Error("Only the declaration's current resolution run may be promoted.");
  }

  const run = await DeclarationFieldResolutionRunModel.findOne({
    _id: params.resolutionRunId,
    declarationId: params.declarationId,
    companyId: params.companyId
  }).lean();
  if (!run) throw new Error("Resolution run not found in declaration/company scope.");

  const targets = params.fieldTargets ?? DEFAULT_DECLARATION_FIELD_TARGETS;
  const declarationPlain = declaration.toObject();
  const normalizedData = cloneObject(declarationPlain.normalizedData);
  const sourceTrace = cloneObject(declarationPlain.sourceTrace);
  const promotedFields: string[] = [];
  const skippedReviewFields: string[] = [];
  const unmappedResolvedFields: string[] = [];

  for (const [fieldName, fieldResolution] of Object.entries(run.resolution.fields)) {
    if (fieldResolution.status === "REVIEW_REQUIRED") {
      skippedReviewFields.push(fieldName);
      continue;
    }

    const targetPath = targets[fieldName] ?? dynamicGoodsLineTarget(fieldName);
    if (!targetPath) {
      unmappedResolvedFields.push(fieldName);
      continue;
    }

    assertPromotable(fieldResolution);
    const selected = fieldResolution.selectedCandidate;
    setPromotionValue(normalizedData, targetPath, fieldResolution.value);
    sourceTrace[targetPath] = {
      value: fieldResolution.value,
      source: selected.documentType,
      provenance: "DECLARATION_FIELD_RESOLUTION",
      resolutionRunId: String(run._id),
      resolutionMethod: fieldResolution.method,
      candidateId: selected.candidateId,
      logicalDocumentId: selected.logicalDocumentId,
      uploadedFileId: selected.uploadedFileId,
      sourceProcessingRunId: selected.sourceProcessingRunId,
      evidence: selected.evidence
    };
    promotedFields.push(fieldName);
  }

  declaration.normalizedData = normalizedData;
  declaration.sourceTrace = sourceTrace as typeof declaration.sourceTrace;
  declaration.markModified("normalizedData");
  declaration.markModified("sourceTrace");
  await declaration.save();

  return {
    resolutionRunId: String(run._id),
    promotedFields: promotedFields.sort(),
    skippedReviewFields: skippedReviewFields.sort(),
    unmappedResolvedFields: unmappedResolvedFields.sort()
  };
}
