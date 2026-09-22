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

function cloneObject(value: unknown): MutableObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return structuredClone(value as MutableObject);
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

    const targetPath = targets[fieldName];
    if (!targetPath) {
      unmappedResolvedFields.push(fieldName);
      continue;
    }

    assertPromotable(fieldResolution);
    const selected = fieldResolution.selectedCandidate;
    setByPath(normalizedData, targetPath, fieldResolution.value);
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
