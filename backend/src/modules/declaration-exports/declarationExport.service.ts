import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { buildEvrimExcel } from "../evrim-excel/evrimExcelAdapter.service.js";
import type { EvrimExcelAdapterOptions } from "../evrim-excel/evrimExcelAdapter.types.js";
import { buildExportDeclarationContract } from "../export-contract/exportDeclarationContract.service.js";
import type { ExportContractIssue, ExportDeclarationSupplements } from "../export-contract/exportDeclarationContract.types.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";

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
  const contract = buildExportDeclarationContract(normalized, input.supplements ?? {});

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
