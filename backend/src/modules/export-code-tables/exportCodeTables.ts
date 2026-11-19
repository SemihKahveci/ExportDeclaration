/**
 * Foundation 5.6B.1 — verified export-format code tables.
 *
 * These are output-system translations, not invoice evidence and not customs
 * master data. Only mappings proven by supplied fixtures belong here.
 * Unknown values are deliberately passed through by the adapter.
 */
export const EVRIM_PACKAGE_TYPE_CODES = {
  bin: "BI",
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
  return EVRIM_PACKAGE_TYPE_CODES[key(value) as keyof typeof EVRIM_PACKAGE_TYPE_CODES] ?? value;
}

export function mapEvrimQuantityUnit(value: string): string {
  return EVRIM_QUANTITY_UNIT_CODES[key(value) as keyof typeof EVRIM_QUANTITY_UNIT_CODES]
    ?? value.toLocaleUpperCase("tr-TR");
}

export function mapEvrimIhracatQuantityUnit(value: string): string {
  return EVRIM_IHRACAT_QUANTITY_UNIT_CODES[key(value) as keyof typeof EVRIM_IHRACAT_QUANTITY_UNIT_CODES]
    ?? value.toLocaleUpperCase("tr-TR");
}
