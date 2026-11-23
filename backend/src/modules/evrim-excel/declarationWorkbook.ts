import * as XLSX from "xlsx";
import { mapEvrimCountryNo, isTurkeyOrigin } from "../export-code-tables/evrimCountryCodes.js";
import { mapEvrimIhracatQuantityUnit, mapEvrimPackageType } from "../export-code-tables/exportCodeTables.js";
import { lookupEvrimFirmaNoByVkn } from "../export-code-tables/evrimVeriTables.js";
import type { ExportDeclarationContract } from "../export-contract/exportDeclarationContract.types.js";
import type { GoodsLine, NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";

/**
 * Evrim ihracat Excel aktarımı (2026-11 paket).
 * Başlık yok; A–AC kolon sırası `ornek-VED2026000000308-basarili-yukleme.xlsx` ile aynı.
 *
 * A PartNo="." · B Ticari Tanım · C Miktar · D Birim · E/F FOB · G/H CIF ·
 * I Menşe(3 hane metin) · J Kap Adedi(yazılmaz) · K Kap Cinsi · L GTİP ·
 * M BrutKG(boş) · N NetKG · O Bedelsiz · P Imalatci · Q MalKodu ·
 * R/S boş · T Imalatçı Tipi · U boş · V İhr.FaturaNo · W Kap Marka(yazılmaz) ·
 * X Fatura Miktarı(döviz, 1.satır) · Y Fatura Miktar Cinsi(tutar, 1.satır) ·
 * Z boş · AA Fatura Tarihi(yazılmaz) · AB Fatura No · AC boş
 */
export const EVRIM_IHRACAT_EXCEL_COLUMNS = {
  partNo: 0,
  description: 1,
  quantity: 2,
  unit: 3,
  fobUnitPrice: 4,
  fobTotal: 5,
  cifUnitPrice: 6,
  cifTotal: 7,
  origin: 8,
  packageCount: 9,
  packageType: 10,
  hsCode: 11,
  grossKg: 12,
  netKg: 13,
  exemption: 14,
  manufacturerNo: 15,
  productCode: 16,
  engDescription: 17,
  styleOrder: 18,
  manufacturerType: 19,
  packageNo: 20,
  exportInvoiceNo: 21,
  packageBrand: 22,
  invoiceCurrency: 23,
  invoiceTotal: 24,
  referenceNo: 25,
  invoiceDate: 26,
  invoiceNo: 27,
  lineNote: 28,
} as const;

export interface DeclarationWorkbook {
  buffer: Buffer;
  rowCount: number;
}

export interface DeclarationWorkbookOptions {
  /** Kullanıcının seçtiği gönderici Evrim ID — imalatçı fallback */
  senderEvrimId?: number;
  /** Gönderici VKN — senderEvrimId yoksa Firma tablosundan çözülür */
  senderTaxNo?: string;
  senderNameHint?: string;
}

type PriceLane = "fob" | "cif";

function deliveryLane(deliveryTerm: string | undefined): PriceLane {
  const first = (deliveryTerm ?? "").trim().charAt(0).toLocaleUpperCase("tr-TR");
  if (first === "C" || first === "D") return "cif";
  return "fob";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function originCode(line: GoodsLine, fallback?: string): string {
  return mapEvrimCountryNo(line.origin) ?? mapEvrimCountryNo(fallback) ?? (line.origin?.trim() || "");
}

function manufacturerTypeFor(originRaw: string | undefined): "I" | "T" {
  return isTurkeyOrigin(originRaw) ? "I" : "T";
}

function linePackageType(line: GoodsLine, packageInfoType?: string): string {
  const raw = (line as GoodsLine & { packageType?: string }).packageType ?? packageInfoType ?? "";
  return raw ? mapEvrimPackageType(raw) : "";
}

function resolveSenderEvrimId(
  options: DeclarationWorkbookOptions,
  normalized: NormalizedDeclaration
): number | undefined {
  if (typeof options.senderEvrimId === "number" && Number.isFinite(options.senderEvrimId)) {
    return options.senderEvrimId;
  }
  const taxNo = options.senderTaxNo ?? normalized.parties?.seller?.taxNo;
  const nameHint = options.senderNameHint ?? normalized.parties?.seller?.name;
  return lookupEvrimFirmaNoByVkn(taxNo, nameHint);
}

function lineManufacturerNo(line: GoodsLine, senderEvrimId?: number): number | "" {
  const explicit = (line as GoodsLine & { manufacturerNo?: number }).manufacturerNo;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  if (typeof senderEvrimId === "number" && Number.isFinite(senderEvrimId)) return senderEvrimId;
  return "";
}

function lineManufacturerType(line: GoodsLine): "I" | "T" | string {
  const explicit = (line as GoodsLine & { manufacturerType?: string }).manufacturerType;
  if (explicit === "I" || explicit === "T") return explicit;
  return manufacturerTypeFor(line.origin);
}

function gtipValue(hsCode: string | undefined): number | string {
  const digits = (hsCode ?? "").replace(/\D/g, "");
  if (/^\d{12}$/.test(digits)) {
    const n = Number(digits);
    return Number.isSafeInteger(n) ? n : digits;
  }
  return hsCode?.trim() || "";
}

function buildRow(
  line: GoodsLine,
  index: number,
  normalized: NormalizedDeclaration,
  options: DeclarationWorkbookOptions,
  senderEvrimId?: number
): Array<string | number> {
  const lane = deliveryLane(normalized.trade?.deliveryTerm);
  const unitPrice = asNumber(line.unitPrice);
  const lineTotal = asNumber(line.lineTotal);
  const quantity = asNumber(line.quantity);
  // D: sadece birim kodu tablodan/seed’den çevrilir (NIU/EA→C62 vb.)
  const unit = line.unit?.trim() ? mapEvrimIhracatQuantityUnit(line.unit) : "";
  // I: ülke adı/kod → Ulke_No
  const origin = originCode(line, normalized.trade?.origin);
  const netFromLine = asNumber(line.netKg);
  const netKg = netFromLine ?? (unit.toUpperCase() === "KGM" && quantity != null ? quantity : undefined);
  const invoiceNo = (line as GoodsLine & { invoiceNo?: string }).invoiceNo?.trim()
    || normalized.header?.invoiceNo?.trim()
    || "";

  const row: Array<string | number> = Array.from({ length: 29 }, () => "");
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.partNo] = ".";
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.description] = line.description?.trim() || "";
  if (quantity != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.quantity] = quantity;
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.unit] = unit;
  if (lane === "fob") {
    if (unitPrice != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.fobUnitPrice] = unitPrice;
    if (lineTotal != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.fobTotal] = lineTotal;
  } else {
    if (unitPrice != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.cifUnitPrice] = unitPrice;
    if (lineTotal != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.cifTotal] = lineTotal;
  }
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.origin] = origin;
  // J Kap Adedi: paket kuralı — yazılmaz
  // K: kap kodu tabloda varsa Kod, yoksa XML değeri olduğu gibi
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.packageType] = linePackageType(line, normalized.packageInfo?.packageType);
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.hsCode] = gtipValue(line.hsCode);
  // M BrutKG şimdilik boş
  if (netKg != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.netKg] = netKg;
  // P: imalatçı Evrim ID (satırda varsa o; yoksa gönderici)
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.manufacturerNo] = lineManufacturerNo(line, senderEvrimId);
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.productCode] = line.productCode?.trim() || "";
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.manufacturerType] = lineManufacturerType(line);
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.exportInvoiceNo] = invoiceNo;
  row[EVRIM_IHRACAT_EXCEL_COLUMNS.invoiceNo] = invoiceNo;

  if (index === 0) {
    row[EVRIM_IHRACAT_EXCEL_COLUMNS.invoiceCurrency] = normalized.header?.currency?.trim().toUpperCase() || "";
    const total = asNumber(normalized.header?.totalAmount);
    if (total != null) row[EVRIM_IHRACAT_EXCEL_COLUMNS.invoiceTotal] = total;
  }

  return row;
}

export function buildDeclarationWorkbook(
  normalized: NormalizedDeclaration,
  _contract: ExportDeclarationContract,
  options: DeclarationWorkbookOptions = {}
): DeclarationWorkbook {
  const lines = normalized.goodsLines ?? [];
  const senderEvrimId = resolveSenderEvrimId(options, normalized);
  const rows = lines.map((line, index) => buildRow(line, index, normalized, options, senderEvrimId));

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  // Menşe metin kalsın (001 → Excel "1" olmasın)
  for (let r = 0; r < rows.length; r++) {
    const addr = XLSX.utils.encode_cell({ c: EVRIM_IHRACAT_EXCEL_COLUMNS.origin, r });
    if (sheet[addr] && typeof sheet[addr].v === "string") {
      sheet[addr].t = "s";
      sheet[addr].z = "@";
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sayfa1");
  return {
    buffer: Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })),
    rowCount: lines.length,
  };
}
