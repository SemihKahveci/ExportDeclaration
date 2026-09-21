import * as XLSX from "xlsx";
import { assertExportDeclarationReady } from "../export-contract/exportDeclarationContract.service.js";
import { mapEvrimPackageType, mapEvrimQuantityUnit } from "../export-code-tables/exportCodeTables.js";
import type { ExportDeclarationLine } from "../export-contract/exportDeclarationContract.types.js";
import {
  EVRIM_EXCEL_HEADERS,
  type EvrimExcelAdapterOptions,
  type EvrimExcelLineOverride,
  type EvrimExcelResult,
  type EvrimExportContract
} from "./evrimExcelAdapter.types.js";

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export const toEvrimPackageType = mapEvrimPackageType;
export const toEvrimQuantityUnit = mapEvrimQuantityUnit;

function overrideFor(
  options: EvrimExcelAdapterOptions,
  line: ExportDeclarationLine,
): EvrimExcelLineOverride {
  return {
    ...(line.hsCode ? options.lineOverrides?.[`hs:${line.hsCode}`] : undefined),
    ...(line.productCode ? options.lineOverrides?.[`product:${line.productCode}`] : undefined),
    ...options.lineOverrides?.[`line:${line.lineNo}`]
  };
}

function excelDate(value: string | undefined): Date | string {
  if (!value) return "";
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

/**
 * Foundation 5.5C — verified Evrim Excel adapter.
 *
 * Column order follows the supplied CHROMYSSTEMS workbook exactly, including
 * the two distinct SİPARİŞ NO columns. Format-specific translations live here,
 * never in IDP/NormalizedDeclaration/ExportDeclarationContract.
 *
 * Only mappings proven by the supplied workbook are hard-coded. In particular
 * canonical package type `Bin` is translated to Evrim `BI`. Unknown values are
 * passed through instead of being guessed.
 */
export function buildEvrimExcel(
  contract: EvrimExportContract,
  options: EvrimExcelAdapterOptions = {},
): EvrimExcelResult {
  assertExportDeclarationReady(contract);

  const rows: Array<Array<string | number | Date>> = [Array.from(EVRIM_EXCEL_HEADERS)];
  const utsRows: Array<Array<string | number>> = [["SATIR", "PART", "ÜTS KAYDI"]];

  for (const line of contract.lines) {
    const extra = overrideFor(options, line);
    const utsNo = clean(extra.utsNo ?? line.utsNo);
    const origin = clean(extra.originCode ?? line.origin);
    const brand = clean(extra.brand ?? line.brand);

    rows.push([
      line.productCode,
      line.quantity,
      toEvrimQuantityUnit(line.unit),
      line.lineTotal,
      line.hsCode,
      origin,
      clean(extra.customsDescription),
      contract.package.totalPackage,
      toEvrimPackageType(contract.package.packageType),
      utsNo,
      line.description,
      clean(extra.exemptionCode ?? line.exemptionCode),
      clean(extra.exemptionCode2),
      clean(contract.trade.deliveryTerm),
      clean(extra.brandName ?? line.brand),
      extra.manufacturerNo ?? "",
      clean(contract.invoice.invoiceNo),
      excelDate(contract.invoice.invoiceDate),
      brand,
      clean(extra.usedFlag ?? line.usedFlag),
      clean(extra.orderType),
      clean(extra.orderRegistration),
      clean(extra.prePermit ?? line.permitCode),
      extra.discount ?? ""
    ]);

    utsRows.push([line.lineNo, line.productCode, utsNo || "ÜTS KAYDI YOK"]);
  }

  const sheet1 = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  const sheet2 = XLSX.utils.aoa_to_sheet(utsRows);

  const mainColumns = EVRIM_EXCEL_HEADERS.map((header) => ({ wch: Math.min(42, Math.max(11, header.length + 2)) }));
  mainColumns[6] = { wch: 42 };
  mainColumns[10] = { wch: 42 };
  sheet1["!cols"] = mainColumns;
  sheet2["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 22 }];

  for (let row = 2; row <= rows.length; row += 1) {
    const dateCell = sheet1[`R${row}`];
    if (dateCell?.t === "d" || dateCell?.t === "n") dateCell.z = "dd.mm.yyyy";
    const hsCell = sheet1[`E${row}`];
    if (hsCell) { hsCell.t = "s"; hsCell.v = String(hsCell.v); }
    const utsCell = sheet1[`J${row}`];
    if (utsCell?.v !== undefined && utsCell.v !== "") { utsCell.t = "s"; utsCell.v = String(utsCell.v); }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet1, "Sayfa1");
  XLSX.utils.book_append_sheet(workbook, sheet2, "Sayfa2");

  return {
    buffer: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true })),
    rowCount: contract.lines.length,
    sheetNames: ["Sayfa1", "Sayfa2"]
  };
}
