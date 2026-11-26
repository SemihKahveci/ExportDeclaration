import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

/**
 * `backend/data/evrim/evrim-veri.xlsx` — Evrim tanım tabloları
 * (Firma / alıcı / Miktar / Kap / Mense). Kod dönüşümü + yazım lookup.
 */

export type EvrimFirmaRow = { gonderenNo: number; unvan: string; vergiNo: string };
export type EvrimAliciRow = {
  musteriNo: number;
  musteriAdi: string;
  aliciNo: number;
  aliciUnvan: string;
  adres: string;
  postaKodu: string;
  ulkeNo: string;
  ulke: string;
};
export type EvrimMiktarRow = {
  siraNo: number;
  aciklamaTr: string;
  aciklamaIng: string;
  aciklama2: string;
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
  /** Müşteri (gönderici) Evrim ID → alıcı adres kartları */
  aliciByMusteriNo: Map<number, EvrimAliciRow[]>;
  aliciByNo: Map<number, EvrimAliciRow[]>;
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

function sheetRows(workbook: XLSX.WorkBook, ...names: string[]): Record<string, unknown>[] {
  for (const name of names) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }
  return [];
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
      aciklama2: cell(row, "Aciklama2"),
      ediKodu,
      cevrimKodu: cell(row, "CevrimKodu"),
    };
    miktarByEdi.set(ediKodu, item);
    // Tüm metin sütunları alias (Excel’deki karşılıklar dinamik)
    for (const alias of [item.aciklamaTr, item.aciklamaIng, item.aciklama2, item.cevrimKodu, item.ediKodu]) {
      if (!alias) continue;
      miktarByAlias.set(normalizeKey(alias), item);
      miktarByAlias.set(alias.toLowerCase(), item);
    }
  }

  const aliciByMusteriNo = new Map<number, EvrimAliciRow[]>();
  const aliciByNo = new Map<number, EvrimAliciRow[]>();
  for (const row of sheetRows(workbook, "alıcı", "alici", "Alici")) {
    const musteriNo = Number(cell(row, "Musteri_No"));
    const aliciNo = Number(cell(row, "Alici_No"));
    const aliciUnvan = cell(row, "Alici_Unvan");
    if (!Number.isFinite(musteriNo) || !Number.isFinite(aliciNo) || !aliciUnvan) continue;
    const item: EvrimAliciRow = {
      musteriNo,
      musteriAdi: cell(row, "Musteri_Adi"),
      aliciNo,
      aliciUnvan,
      adres: cell(row, "Adres"),
      postaKodu: cell(row, "PostaKodu"),
      ulkeNo: cell(row, "Ulke_No"),
      ulke: cell(row, "Ulke"),
    };
    const byMusteri = aliciByMusteriNo.get(musteriNo) ?? [];
    byMusteri.push(item);
    aliciByMusteriNo.set(musteriNo, byMusteri);
    const byNo = aliciByNo.get(aliciNo) ?? [];
    byNo.push(item);
    aliciByNo.set(aliciNo, byNo);
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

  cached = {
    sourcePath,
    firmaByVkn,
    firmaByNo,
    aliciByMusteriNo,
    aliciByNo,
    miktarByEdi,
    miktarByAlias,
    kapByKod,
    menseByCode,
    menseByName,
  };
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

/** UI kontrol metni: EDI/alias → okunur birim adı (Excel kodu değişmez). */
export function lookupEvrimQuantityUnitLabelFromTables(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const seed: Record<string, string> = {
    C62: "Adet",
    NIU: "Adet",
    EA: "Adet",
    ADET: "Adet",
    KGM: "Kilogram",
    KG: "Kilogram",
    MTK: "Metrekare",
    SET: "Set",
    LTR: "Litre",
    MTR: "Metre",
  };
  const tables = loadEvrimVeriTables();
  const code = lookupEvrimQuantityUnitFromTables(raw) ?? raw.toUpperCase();
  const friendly = seed[code] ?? seed[raw.toUpperCase()];
  if (friendly) return friendly;
  const row = tables?.miktarByEdi.get(code)
    ?? tables?.miktarByAlias.get(normalizeKey(raw))
    ?? tables?.miktarByAlias.get(raw.toLowerCase());
  if (row?.aciklamaTr && row.aciklamaTr.length > 2) return row.aciklamaTr;
  if (row?.aciklamaIng && row.aciklamaIng.length > 2) return row.aciklamaIng;
  return row?.aciklamaTr;
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

function textMatchScore(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = normalizeKey(haystack);
  const n = normalizeKey(needle);
  if (!h || !n) return 0;
  if (h === n) return 4;
  if (h.includes(n) || n.includes(h)) return 2;
  return 0;
}

/** Gönderici (Firma) listesinde ad / Evrim ID / VKN araması. */
export function searchEvrimGonderen(query: string, limit = 25): EvrimFirmaRow[] {
  const tables = loadEvrimVeriTables();
  if (!tables) return [];
  const q = query.trim();
  const asNo = Number(q);
  const vkn = normalizeVkn(q);
  const scored: Array<{ row: EvrimFirmaRow; score: number }> = [];
  for (const row of tables.firmaByNo.values()) {
    let score = 0;
    if (Number.isFinite(asNo) && row.gonderenNo === asNo) score = 5;
    else if (vkn && row.vergiNo === vkn) score = 4;
    else score = textMatchScore(row.unvan, q);
    if (score > 0) scored.push({ row, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.row.gonderenNo - b.row.gonderenNo)
    .slice(0, Math.max(1, limit))
    .map((item) => item.row);
}

/** Müşteriye bağlı alıcı adres kartlarında arama. */
export function searchEvrimAliciForMusteri(
  musteriNo: number,
  query = "",
  limit = 40
): EvrimAliciRow[] {
  const tables = loadEvrimVeriTables();
  if (!tables || !Number.isFinite(musteriNo)) return [];
  const rows = tables.aliciByMusteriNo.get(musteriNo) ?? [];
  const q = query.trim();
  if (!q) return rows.slice(0, Math.max(1, limit));
  const asNo = Number(q);
  const scored = rows
    .map((row) => {
      let score = 0;
      if (Number.isFinite(asNo) && row.aliciNo === asNo) score = 5;
      else {
        score = Math.max(
          textMatchScore(row.aliciUnvan, q),
          textMatchScore(row.adres, q),
          textMatchScore(row.ulke, q)
        );
      }
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.aliciNo - b.row.aliciNo);
  return scored.slice(0, Math.max(1, limit)).map((item) => item.row);
}

/**
 * Faturadaki alıcı adı (+ isteğe bağlı adres) ile müşteriye bağlı kart eşleştir.
 * Tek net eşleşme → kart; birden fazla / hiç → null (UI seçtirir veya “ID yok”).
 */
export function matchEvrimAliciForMusteri(
  musteriNo: number,
  aliciUnvan: string | undefined | null,
  adresHint?: string | null
): { status: "matched"; row: EvrimAliciRow } | { status: "ambiguous"; rows: EvrimAliciRow[] } | { status: "not_found" } {
  const tables = loadEvrimVeriTables();
  if (!tables || !Number.isFinite(musteriNo)) return { status: "not_found" };
  const pool = tables.aliciByMusteriNo.get(musteriNo) ?? [];
  if (pool.length === 0) return { status: "not_found" };
  const name = (aliciUnvan ?? "").trim();
  if (!name) return { status: "not_found" };

  const byName = pool.filter((row) => textMatchScore(row.aliciUnvan, name) >= 2);
  if (byName.length === 0) return { status: "not_found" };
  if (byName.length === 1) return { status: "matched", row: byName[0]! };

  const adres = (adresHint ?? "").trim();
  if (adres) {
    const byAdres = byName
      .map((row) => ({ row, score: textMatchScore(row.adres, adres) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (byAdres.length === 1 || (byAdres[0] && byAdres[0].score > (byAdres[1]?.score ?? 0))) {
      return { status: "matched", row: byAdres[0]!.row };
    }
    if (byAdres.length > 1) return { status: "ambiguous", rows: byAdres.map((item) => item.row) };
  }
  return { status: "ambiguous", rows: byName };
}

export function listEvrimMiktarOptions(): EvrimMiktarRow[] {
  const tables = loadEvrimVeriTables();
  if (!tables) return [];
  return [...tables.miktarByEdi.values()].sort((a, b) => a.siraNo - b.siraNo);
}

export function listEvrimKapOptions(): EvrimKapRow[] {
  const tables = loadEvrimVeriTables();
  if (!tables) return [];
  const seen = new Set<string>();
  const rows: EvrimKapRow[] = [];
  for (const row of tables.kapByKod.values()) {
    if (seen.has(row.kod)) continue;
    seen.add(row.kod);
    rows.push(row);
  }
  return rows.sort((a, b) => a.kod.localeCompare(b.kod));
}

export function listEvrimMenseOptions(): EvrimMenseRow[] {
  const tables = loadEvrimVeriTables();
  if (!tables) return [];
  const seen = new Set<string>();
  const rows: EvrimMenseRow[] = [];
  for (const row of tables.menseByCode.values()) {
    if (seen.has(row.ulkeNo)) continue;
    seen.add(row.ulkeNo);
    rows.push(row);
  }
  return rows.sort((a, b) => a.ulkeNo.localeCompare(b.ulkeNo));
}
