import type { ExportDeclarationContract } from "../export-contract/exportDeclarationContract.types.js";

export const EVRIM_EXCEL_HEADERS = [
  "MODEL", "MİKTAR", "MİKTAR CİNSİ", "KIYMET", "GTİP", "MENŞE", "TİCARİ TANIM",
  "KAP ADETİ", "KAP CİNSİ", "ÜTS NO", "MAL KODU", "MUAFİYET", "MUAFİYET 2",
  "TESLİM ŞEKLİ", "MARKA ADI", "ÜRETİCİ NO", "FATURA NO", "FATURA TARİH", "MARKA",
  "KULLANILMIŞ", "SİPARİŞ NO", "SİPARİŞ NO", "ÖN İZİN", "İSKONTO"
] as const;

export interface EvrimExcelLineOverride {
  originCode?: string;
  customsDescription?: string;
  utsNo?: string;
  exemptionCode?: string;
  exemptionCode2?: string;
  brandName?: string;
  manufacturerNo?: string | number;
  brand?: string;
  usedFlag?: string;
  orderType?: string;
  orderRegistration?: string;
  prePermit?: string;
  discount?: number;
}

export interface EvrimExcelAdapterOptions {
  lineOverrides?: Record<string, EvrimExcelLineOverride>;
}

export interface EvrimExcelResult {
  buffer: Buffer;
  rowCount: number;
  sheetNames: ["Sayfa1", "Sayfa2"];
}

export type EvrimExportContract = ExportDeclarationContract;
