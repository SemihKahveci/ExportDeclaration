import * as XLSX from "xlsx";
import { HttpError } from "../../common/middlewares/errorHandler.js";

export interface ParsedMaterialExcelRow {
  materialNo: string;
  description: string;
  gtipNo: string;
}

export interface MaterialExcelRowError {
  row: number;
  message: string;
}

export interface MaterialExcelParseResult {
  items: Array<{ row: number; item: ParsedMaterialExcelRow }>;
  errors: MaterialExcelRowError[];
}

interface ColumnIndexes {
  materialNo: number;
  description: number;
  gtipNo: number;
}

function cellStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isEmpty(value: unknown): boolean {
  const s = cellStr(value);
  return s === "" || s === "-";
}

function normalizeHeader(value: unknown): string {
  return cellStr(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function findColumnIndexes(headerRow: unknown[]): ColumnIndexes | null {
  let materialNo = -1;
  let description = -1;
  let gtipNo = -1;

  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (key.includes("malzeme") && key.includes("no")) {
      materialNo = index;
    } else if (key.includes("malzeme") && key.includes("tanim")) {
      description = index;
    } else if (key === "gtip" || key.includes("gtip")) {
      gtipNo = index;
    }
  });

  if (materialNo >= 0 && description >= 0 && gtipNo >= 0) {
    return { materialNo, description, gtipNo };
  }
  return null;
}

function readSheetRows(buffer: Buffer): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new HttpError(400, "Excel dosyası boş veya okunamıyor.");
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet?.["!ref"]) {
    throw new HttpError(400, "Excel dosyası boş veya okunamıyor.");
  }

  return XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
}

export function parseMaterialRecordExcel(buffer: Buffer): MaterialExcelParseResult {
  const rows = readSheetRows(buffer);
  if (rows.length === 0) {
    throw new HttpError(400, "Excel dosyası boş veya okunamıyor.");
  }

  const headerRow = rows[0] ?? [];
  const cols = findColumnIndexes(headerRow) ?? { materialNo: 0, description: 1, gtipNo: 2 };
  const dataStartRow = 1;

  const items: MaterialExcelParseResult["items"] = [];
  const errors: MaterialExcelRowError[] = [];
  const seenMaterialNos = new Set<string>();

  for (let rowIndex = dataStartRow; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;

    const isRowEmpty = row.every((cell) => isEmpty(cell));
    if (isRowEmpty) continue;

    const materialNo = cellStr(row[cols.materialNo]);
    const description = cellStr(row[cols.description]);
    const gtipNo = cellStr(row[cols.gtipNo]);

    const missing: string[] = [];
    if (isEmpty(materialNo)) missing.push("Malzeme No");
    if (isEmpty(description)) missing.push("Malzeme Tanımı");
    if (isEmpty(gtipNo)) missing.push("GTİP");

    if (missing.length > 0) {
      errors.push({
        row: rowNumber,
        message: `Eksik/geçersiz alanlar: ${missing.join(", ")}. Tüm alanlar dolu olmalıdır.`
      });
      continue;
    }

    const materialKey = materialNo.toLocaleLowerCase("tr-TR");
    if (seenMaterialNos.has(materialKey)) {
      errors.push({
        row: rowNumber,
        message: `Dosyada tekrarlayan malzeme no: ${materialNo}`
      });
      continue;
    }
    seenMaterialNos.add(materialKey);

    items.push({
      row: rowNumber,
      item: { materialNo, description, gtipNo }
    });
  }

  return { items, errors };
}

export function buildMaterialRecordImportTemplate(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Malzeme No", "Malzeme Tanımı", "GTIP"],
    ["Ad12313", "Malzeme 1", "0102.21.10.00.00"],
    ["123415", "Malzeme 2", "0102.21.10.00.00"]
  ]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 22 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
