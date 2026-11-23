import { lookupEvrimCountryNoFromTables } from "./evrimVeriTables.js";

/**
 * Evrim Ulke_No lookup.
 * Önce `evrim-veri.xlsx` Mense sayfası; yoksa paket golden seed.
 * Excel’e 3 haneli metin yazılır ("001").
 */
const BY_CODE: Record<string, string> = {
  FR: "001",
  DE: "004",
  BE: "017",
  GR: "009",
  TR: "052",
  PL: "060",
  IT: "011",
  CN: "720",
  IN: "664",
  CH: "013",
  AL: "008",
  SY: "053",
  IR: "025",
  HU: "022",
  BG: "012",
};

const BY_NAME: Record<string, string> = {
  FRANCE: "001",
  FRANSA: "001",
  GERMANY: "004",
  ALMANYA: "004",
  BELGIUM: "017",
  BELCIKA: "017",
  BELÇIKA: "017",
  GREECE: "009",
  YUNANISTAN: "009",
  YUNANİSTAN: "009",
  TURKEY: "052",
  TURKIYE: "052",
  TÜRKİYE: "052",
  "TURK MALI": "052",
  "TÜRK MALI": "052",
  POLAND: "060",
  POLONYA: "060",
  ITALY: "011",
  ITALYA: "011",
  İTALYA: "011",
  CHINA: "720",
  CIN: "720",
  ÇİN: "720",
  INDIA: "664",
  HINDISTAN: "664",
  HİNDİSTAN: "664",
  SWITZERLAND: "013",
  ISVICRE: "013",
  İSVİÇRE: "013",
  ALBANIA: "008",
  ARNAVUTLUK: "008",
  SYRIA: "053",
  SURIYE: "053",
  HUNGARY: "022",
  MACARISTAN: "022",
  MACARİSTAN: "022",
  BULGARIA: "012",
  BULGARISTAN: "012",
  BULGARİSTAN: "012",
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, " ")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Evrim menşe numarası (3 hane metin). Bulunamazsa undefined. */
export function mapEvrimCountryNo(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const fromTables = lookupEvrimCountryNoFromTables(value);
  if (fromTables) return fromTables;

  const raw = value.trim();
  if (!raw) return undefined;
  if (/^\d{1,3}$/.test(raw)) return raw.padStart(3, "0");

  const upper = raw.toLocaleUpperCase("tr-TR");
  if (/^[A-Z]{2}$/.test(upper) && BY_CODE[upper]) return BY_CODE[upper];

  const byName = BY_NAME[upper] ?? BY_NAME[normalizeKey(raw)];
  if (byName) return byName;

  // "MENŞEİ: TÜRKİYE" / "MALLARIMIZ TÜRK MENŞEİLİDİR"
  for (const [name, code] of Object.entries(BY_NAME)) {
    if (upper.includes(name) || normalizeKey(raw).includes(normalizeKey(name))) return code;
  }
  return undefined;
}

export function isTurkeyOrigin(value: string | undefined | null): boolean {
  return mapEvrimCountryNo(value) === "052";
}
