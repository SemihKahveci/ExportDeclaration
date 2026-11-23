import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

/**
 * `backend/data/evrim/evrim-veri.xlsx` — Evrim tanım tabloları (Firma/Miktar/Kap/Mense).
 * Sadece kod dönüşümü için kullanılır; fatura alanlarını değiştirmez.
 */

export type EvrimFirmaRow = { gonderenNo: number; unvan: string; vergiNo: string };
export type EvrimMiktarRow = {
  siraNo: number;
  aciklamaTr: string;
  aciklamaIng: string;
  ediKodu: string;
  cevrimKodu: string;
};
export type EvrimKapRow = { kod: string; tanim: string; packingTypeCode: string };
export type EvrimMenseRow = {
  ulkeNo: string;
  ulkeKodu: string;
  ulke: string;
  yUlke: string;
  sbUlke: string;
  ublMensei: string;
};

export type EvrimVeriTables = {
  sourcePath: string;
  firmaByVkn: Map<string, EvrimFirmaRow[]>;
  firmaByNo: Map<number, EvrimFirmaRow>;
  miktarByEdi: Map<string, EvrimMiktarRow>;
  miktarByAlias: Map<string, EvrimMiktarRow>;
  kapByKod: Map<string, EvrimKapRow>;
  menseByCode: Map<string, EvrimMenseRow>;
  menseByName: Map<string, EvrimMenseRow>;
};

const HARD_UNIT_ALIASES: Record<string, string> = {
  niu: "C62",
  ea: "C62",
  adet: "C62",
  pcs: "C62",
  piece: "C62",
  pieces: "C62",
  kg: "KGM",
  kilogram: "KGM",
};

let cached: EvrimVeriTables | null = null;
let cachedPath: string | null = null;

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text && text.toUpperCase() !== "NULL") return text;
  }
  return "";
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, " ")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeVkn(value: string): string {
  return value.replace(/\D/g, "");
}

function sheetRows(workbook: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export function resolveEvrimVeriXlsxPath(): string | undefined {
  const fromEnv = process.env.EVRIM_VERI_XLSX?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  // CJS build: import.meta yok. cwd + bilinen relative yollar yeterli (Docker: /app/backend).
  const candidates = [
    path.resolve(process.cwd(), "data/evrim/evrim-veri.xlsx"),
    path.resolve(process.cwd(), "backend/data/evrim/evrim-veri.xlsx"),
    path.resolve(__dirname, "../../../data/evrim/evrim-veri.xlsx"),
    path.resolve(__dirname, "../../data/evrim/evrim-veri.xlsx"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function loadEvrimVeriTables(forcePath?: string): EvrimVeriTables | null {
  const sourcePath = forcePath ?? resolveEvrimVeriXlsxPath();
  if (!sourcePath) return null;
  if (cached && cachedPath === sourcePath && !forcePath) return cached;

  const workbook = XLSX.readFile(sourcePath);
  const firmaByVkn = new Map<string, EvrimFirmaRow[]>();
  const firmaByNo = new Map<number, EvrimFirmaRow>();
  for (const row of sheetRows(workbook, "Firma")) {
    const gonderenNo = Number(cell(row, "Gonderen_No"));
    const unvan = cell(row, "Gonderen_TamUnvan");
    const vergiNo = normalizeVkn(cell(row, "Vergi_No"));
    if (!Number.isFinite(gonderenNo) || !vergiNo) continue;
    const item: EvrimFirmaRow = { gonderenNo, unvan, vergiNo };
    firmaByNo.set(gonderenNo, item);
    const list = firmaByVkn.get(vergiNo) ?? [];
    list.push(item);
    firmaByVkn.set(vergiNo, list);
  }

  const miktarByEdi = new Map<string, EvrimMiktarRow>();
  const miktarByAlias = new Map<string, EvrimMiktarRow>();
  for (const row of sheetRows(workbook, "Miktar")) {
    const ediKodu = cell(row, "EdiKodu").toUpperCase();
    if (!ediKodu) continue;
    const item: EvrimMiktarRow = {
      siraNo: Number(cell(row, "Sira_No")) || 0,
      aciklamaTr: cell(row, "AciklamaTR"),
      aciklamaIng: cell(row, "AciklamaING"),
      ediKodu,
      cevrimKodu: cell(row, "CevrimKodu"),
    };
    miktarByEdi.set(ediKodu, item);
    for (const alias of [item.aciklamaTr, item.aciklamaIng, item.cevrimKodu, item.ediKodu]) {
      if (!alias) continue;
      miktarByAlias.set(normalizeKey(alias), item);
      miktarByAlias.set(alias.toLowerCase(), item);
    }
  }

  const kapByKod = new Map<string, EvrimKapRow>();
  for (const row of sheetRows(workbook, "Kap")) {
    const kod = cell(row, "Kod").toUpperCase();
    if (!kod) continue;
    const item: EvrimKapRow = {
      kod,
      tanim: cell(row, "Tanim"),
      packingTypeCode: cell(row, "PackingTypeCode").toUpperCase(),
    };
    kapByKod.set(kod, item);
    if (item.packingTypeCode) kapByKod.set(item.packingTypeCode, item);
    if (item.tanim) kapByKod.set(normalizeKey(item.tanim), item);
  }

  const menseByCode = new Map<string, EvrimMenseRow>();
  const menseByName = new Map<string, EvrimMenseRow>();
  for (const row of sheetRows(workbook, "Mense")) {
    const ulkeNo = cell(row, "Ulke_No").padStart(3, "0").slice(-3);
    if (!/^\d{3}$/.test(ulkeNo)) continue;
    const item: EvrimMenseRow = {
      ulkeNo,
      ulkeKodu: cell(row, "Ulke_Kodu").toUpperCase(),
      ulke: cell(row, "Ulke"),
      yUlke: cell(row, "YUlke"),
      sbUlke: cell(row, "SBUlke"),
      ublMensei: cell(row, "UBLMensei"),
    };
    menseByCode.set(ulkeNo, item);
    if (item.ulkeKodu) menseByCode.set(item.ulkeKodu, item);
    for (const name of [item.ulke, item.yUlke, item.sbUlke, item.ublMensei]) {
      if (!name) continue;
      menseByName.set(normalizeKey(name), item);
      menseByName.set(name.toLocaleUpperCase("tr-TR"), item);
    }
  }

  cached = { sourcePath, firmaByVkn, firmaByNo, miktarByEdi, miktarByAlias, kapByKod, menseByCode, menseByName };
  cachedPath = sourcePath;
  return cached;
}

export function resetEvrimVeriTablesCache(): void {
  cached = null;
  cachedPath = null;
}

export function lookupEvrimCountryNoFromTables(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const tables = loadEvrimVeriTables();
  if (!tables) return undefined;
  if (/^\d{1,3}$/.test(raw)) {
    const padded = raw.padStart(3, "0");
    return tables.menseByCode.get(padded)?.ulkeNo;
  }
  const upper = raw.toLocaleUpperCase("tr-TR");
  if (/^[A-Z]{2}$/.test(upper)) {
    const byCode = tables.menseByCode.get(upper);
    if (byCode) return byCode.ulkeNo;
  }
  const byName = tables.menseByName.get(upper) ?? tables.menseByName.get(normalizeKey(raw));
  if (byName) return byName.ulkeNo;
  for (const [name, row] of tables.menseByName) {
    if (name.length < 3) continue;
    if (upper.includes(name) || normalizeKey(raw).includes(name)) return row.ulkeNo;
  }
  return undefined;
}

export function lookupEvrimQuantityUnitFromTables(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (HARD_UNIT_ALIASES[lower]) return HARD_UNIT_ALIASES[lower];

  const tables = loadEvrimVeriTables();
  if (!tables) return undefined;
  const upper = raw.toUpperCase();
  const direct = tables.miktarByEdi.get(upper);
  if (direct) return direct.ediKodu;
  const alias = tables.miktarByAlias.get(normalizeKey(raw)) ?? tables.miktarByAlias.get(lower);
  return alias?.ediKodu;
}

export function lookupEvrimPackageTypeFromTables(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const tables = loadEvrimVeriTables();
  if (!tables) return undefined;
  const upper = raw.toUpperCase();
  const direct = tables.kapByKod.get(upper);
  if (direct) return direct.kod;
  const byName = tables.kapByKod.get(normalizeKey(raw));
  return byName?.kod;
}

/** VKN → Gonderen_No. Aynı VKN’de birden fazla kart varsa nameHint ile daraltır. */
export function lookupEvrimFirmaNoByVkn(
  taxNo: string | undefined | null,
  nameHint?: string
): number | undefined {
  const vkn = normalizeVkn(taxNo ?? "");
  if (!vkn) return undefined;
  const tables = loadEvrimVeriTables();
  if (!tables) return undefined;
  const matches = tables.firmaByVkn.get(vkn) ?? [];
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0]!.gonderenNo;
  if (!nameHint) return matches[0]!.gonderenNo;
  const hint = normalizeKey(nameHint);
  const scored = matches
    .map((row) => ({
      row,
      score: normalizeKey(row.unvan).includes(hint) || hint.includes(normalizeKey(row.unvan)) ? 2 : 0,
    }))
    .sort((a, b) => b.score - a.score);
  return (scored[0]?.score ? scored[0].row : matches[0])?.gonderenNo;
}
