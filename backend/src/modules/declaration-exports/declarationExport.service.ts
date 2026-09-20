import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { buildEvrimExcel } from "../evrim-excel/evrimExcelAdapter.service.js";
import type { EvrimExcelAdapterOptions } from "../evrim-excel/evrimExcelAdapter.types.js";
import { buildExportDeclarationContract } from "../export-contract/exportDeclarationContract.service.js";
import type { ExportContractIssue, ExportDeclarationSupplements } from "../export-contract/exportDeclarationContract.types.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import { buildUnsignedUblIhracat } from "../ubl-ihracat/ublIhracatAdapter.service.js";
import type { UblIhracatAdapterOptions, UblIhracatIssue } from "../ubl-ihracat/ublIhracatAdapter.types.js";
import { overlayHumanSupplements, resolveCustomsMasterData } from "../customs-master-data/customsMasterData.service.js";

export interface EvrimExcelExportInput {
  supplements?: ExportDeclarationSupplements;
  lineOverrides?: EvrimExcelAdapterOptions["lineOverrides"];
}

export type EvrimExcelExportResult =
  | { ready: false; issues: ExportContractIssue[] }
  | { ready: true; buffer: Buffer; filename: string; rowCount: number };

function safeFilenamePart(value: string | undefined): string {
  const cleaned = (value ?? "beyanname").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return cleaned || "beyanname";
}

/**
 * Foundation 5.5D — production export boundary.
 * Tenant-scoped declaration -> format-neutral contract -> readiness gate -> Evrim XLSX.
 * No partial workbook is emitted when the contract is not ready.
 */
export async function exportDeclarationAsEvrimExcel(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
  input: EvrimExcelExportInput = {},
): Promise<EvrimExcelExportResult> {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");

  const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!declaration) throw new HttpError(404, "Beyanname bulunamadı.");
  if (!declaration.normalizedData) throw new HttpError(409, "Beyanname henüz normalize edilmemiş.");

  const normalized = declaration.normalizedData as NormalizedDeclaration;
  const master = await resolveCustomsMasterData(companyId, declaration.operation?.customerId, normalized);
  const supplements = overlayHumanSupplements(master.supplements, input.supplements ?? {});
  const contract = buildExportDeclarationContract(normalized, supplements);

  if (!contract.readiness.ready) {
    return { ready: false, issues: contract.readiness.issues };
  }

  const excel = buildEvrimExcel(contract, { lineOverrides: input.lineOverrides });
  const invoiceNo = safeFilenamePart(contract.invoice.invoiceNo);

  return {
    ready: true,
    buffer: excel.buffer,
    filename: `${invoiceNo}-evrim.xlsx`,
    rowCount: excel.rowCount
  };
}


export interface UblIhracatExportInput {
  supplements?: ExportDeclarationSupplements;
  uuid: string;
  invoiceTypeCode?: UblIhracatAdapterOptions["invoiceTypeCode"];
  issueTime?: UblIhracatAdapterOptions["issueTime"];
  transportModeCode?: UblIhracatAdapterOptions["transportModeCode"];
}

export type UblIhracatExportResult =
  | { ready: false; issues: UblIhracatIssue[] }
  | { ready: true; buffer: Buffer; filename: string; lineCount: number; profileId: "IHRACAT"; signed: false };

/**
 * Foundation 5.5E.2 — production unsigned UBL-TR IHRACAT export boundary.
 * Tenant-scoped declaration -> format-neutral contract -> UBL readiness gate -> XML.
 * UUID is explicit input and is never copied from another invoice.
 */
export async function exportDeclarationAsUnsignedUblIhracat(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
  input: UblIhracatExportInput,
): Promise<UblIhracatExportResult> {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  if (!input || typeof input.uuid !== "string" || !input.uuid.trim()) {
    throw new HttpError(400, "UBL ihracat için uuid zorunludur.");
  }

  const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!declaration) throw new HttpError(404, "Beyanname bulunamadı.");
  if (!declaration.normalizedData) throw new HttpError(409, "Beyanname henüz normalize edilmemiş.");

  const normalized = declaration.normalizedData as NormalizedDeclaration;
  const master = await resolveCustomsMasterData(companyId, declaration.operation?.customerId, normalized);
  const supplements = overlayHumanSupplements(master.supplements, input.supplements ?? {});
  const contract = buildExportDeclarationContract(normalized, supplements);

  if (!contract.readiness.ready) {
    return { ready: false, issues: contract.readiness.issues };
  }

  const ubl = buildUnsignedUblIhracat(contract, {
    uuid: input.uuid,
    invoiceTypeCode: input.invoiceTypeCode,
    issueTime: input.issueTime,
    transportModeCode: input.transportModeCode,
  });

  if (!ubl.ready) {
    return { ready: false, issues: ubl.issues };
  }

  const invoiceNo = safeFilenamePart(contract.invoice.invoiceNo);
  return {
    ready: true,
    buffer: Buffer.from(ubl.xml, "utf8"),
    filename: `${invoiceNo}-ubl-ihracat.xml`,
    lineCount: ubl.lineCount,
    profileId: ubl.profileId,
    signed: ubl.signed,
  };
}
