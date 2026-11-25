import {
  lookupEvrimPackageTypeFromTables,
  lookupEvrimQuantityUnitFromTables,
  lookupEvrimQuantityUnitLabelFromTables,
} from "./evrimVeriTables.js";

/**
 * Foundation 5.6B.1 — verified export-format code tables.
 *
 * Önce `evrim-veri.xlsx` (Miktar/Kap); yoksa aşağıdaki seed.
 * Unknown values are deliberately passed through by the adapter.
 */
export const EVRIM_PACKAGE_TYPE_CODES = {
  bin: "BI",
  palet: "PALET",
} as const;

/**
 * CHROMY/Evrim Excel adapter birimleri (eski başlıklı format).
 * İhracat aktarım Excel’i (`declarationWorkbook`) NIU/EA→C62 ayrıca mapEvrimIhracatQuantityUnit kullanır.
 */
export const EVRIM_QUANTITY_UNIT_CODES = {
  adet: "ADET",
  pcs: "ADET",
  piece: "ADET",
  pieces: "ADET",
} as const;

/** e-ihracat → Evrim ihracat Excel aktarımı birim kodları. */
export const EVRIM_IHRACAT_QUANTITY_UNIT_CODES = {
  adet: "C62",
  pcs: "C62",
  piece: "C62",
  pieces: "C62",
  niu: "C62",
  ea: "C62",
  c62: "C62",
  kgm: "KGM",
  kg: "KGM",
  mtk: "MTK",
  set: "SET",
} as const;

function clean(value: string): string {
  return value.trim();
}

function key(value: string): string {
  // Unit/package codes are Latin (NIU, EA, KGM). tr-TR lowercasing turns I→ı and breaks lookups.
  return clean(value).toLowerCase();
}

export function mapEvrimPackageType(value: string): string {
  const fromTables = lookupEvrimPackageTypeFromTables(value);
  if (fromTables) return fromTables;
  return EVRIM_PACKAGE_TYPE_CODES[key(value) as keyof typeof EVRIM_PACKAGE_TYPE_CODES] ?? value;
}

export function mapEvrimQuantityUnit(value: string): string {
  const fromTables = lookupEvrimQuantityUnitFromTables(value);
  if (fromTables) return fromTables;
  return EVRIM_QUANTITY_UNIT_CODES[key(value) as keyof typeof EVRIM_QUANTITY_UNIT_CODES]
    ?? value.toLocaleUpperCase("tr-TR");
}

export function mapEvrimIhracatQuantityUnit(value: string): string {
  const fromTables = lookupEvrimQuantityUnitFromTables(value);
  if (fromTables) return fromTables;
  return EVRIM_IHRACAT_QUANTITY_UNIT_CODES[key(value) as keyof typeof EVRIM_IHRACAT_QUANTITY_UNIT_CODES]
    ?? value.toLocaleUpperCase("tr-TR");
}

/** Yazım ekranı: birim kodunun Türkçe karşılığı. Excel hâlâ kod basar. */
export function labelEvrimQuantityUnit(value: string | undefined | null): string {
  if (!value?.trim()) return "";
  return lookupEvrimQuantityUnitLabelFromTables(value) ?? value.trim();
}
