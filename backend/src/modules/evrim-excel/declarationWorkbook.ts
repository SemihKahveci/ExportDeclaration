import * as XLSX from "xlsx";
import { mapEvrimPackageType, mapEvrimQuantityUnit } from "../export-code-tables/exportCodeTables.js";
import type { ExportDeclarationContract } from "../export-contract/exportDeclarationContract.types.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";

/**
 * Column letters are the İhracat Excel statü grid. The workbook does not
 * print those headings: the first row is the first goods line. A cell with
 * no parsed value stays blank.
 */
const COLUMN = {
  partNo: "A",
  description: "B",
  quantity: "C",
  unit: "D",
  fobUnitPrice: "E",
  fobTotal: "F",
  cifUnitPrice: "G",
  cifTotal: "H",
  origin: "I",
  packageCount: "J",
  packageType: "K",
  hsCode: "L",
  grossKg: "M",
  netKg: "N",
  exemption: "V",
  productCode: "Z",
  brand: "AN",
  invoiceDate: "AV",
  invoiceNo: "AW"
} as const;

export interface DeclarationWorkbook {
  buffer: Buffer;
  rowCount: number;
}

function columnIndex(column: string): number {
  let index = 0;
  for (const char of column) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function put(sheet: XLSX.WorkSheet, column: string, row: number, value: string | number | Date | undefined): void {
  if (value === undefined || value === null || value === "") return;
  const address = XLSX.utils.encode_cell({ c: columnIndex(column), r: row });
  if (value instanceof Date) {
    sheet[address] = { t: "d", v: value, z: "dd.mm.yyyy" };
    return;
  }
  if (typeof value === "number") {
    sheet[address] = { t: "n", v: value };
    return;
  }
  sheet[address] = { t: "s", v: value };
}

function invoiceDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isCif(deliveryTerm: string | undefined): boolean {
  return (deliveryTerm ?? "").toLocaleUpperCase("tr-TR").includes("CIF");
}

export function buildDeclarationWorkbook(
  normalized: NormalizedDeclaration,
  contract: ExportDeclarationContract
): DeclarationWorkbook {
  const sheet: XLSX.WorkSheet = {};
  const lines = normalized.goodsLines ?? [];
  const cif = isCif(normalized.trade?.deliveryTerm);
  const packageInfo = normalized.packageInfo ?? {};

  lines.forEach((source, index) => {
    const extra = contract.lines[index];
    put(sheet, COLUMN.partNo, index, ".");
    put(sheet, COLUMN.description, index, source.description?.trim());
    if (typeof source.quantity === "number") put(sheet, COLUMN.quantity, index, source.quantity);
    if (source.unit?.trim()) put(sheet, COLUMN.unit, index, mapEvrimQuantityUnit(source.unit));
    if (typeof source.unitPrice === "number") put(sheet, cif ? COLUMN.cifUnitPrice : COLUMN.fobUnitPrice, index, source.unitPrice);
    if (typeof source.lineTotal === "number") put(sheet, cif ? COLUMN.cifTotal : COLUMN.fobTotal, index, source.lineTotal);
    put(sheet, COLUMN.origin, index, extra?.origin?.trim() || source.origin?.trim());
    put(sheet, COLUMN.hsCode, index, source.hsCode?.trim());
    put(sheet, COLUMN.productCode, index, source.productCode?.trim());
    put(sheet, COLUMN.exemption, index, extra?.exemptionCode?.trim());
    put(sheet, COLUMN.brand, index, extra?.brand?.trim());
    if (index === 0) {
      if (typeof packageInfo.totalPackage === "number") put(sheet, COLUMN.packageCount, index, packageInfo.totalPackage);
      if (packageInfo.packageType?.trim()) put(sheet, COLUMN.packageType, index, mapEvrimPackageType(packageInfo.packageType));
      if (typeof packageInfo.grossKg === "number") put(sheet, COLUMN.grossKg, index, packageInfo.grossKg);
      if (typeof packageInfo.netKg === "number") put(sheet, COLUMN.netKg, index, packageInfo.netKg);
      put(sheet, COLUMN.invoiceNo, index, normalized.header?.invoiceNo?.trim());
      put(sheet, COLUMN.invoiceDate, index, invoiceDate(normalized.header?.invoiceDate));
    }
  });

  const lastRow = Math.max(lines.length - 1, 0);
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: columnIndex(COLUMN.invoiceNo), r: lastRow }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sayfa1");
  return {
    buffer: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true })),
    rowCount: lines.length
  };
}
