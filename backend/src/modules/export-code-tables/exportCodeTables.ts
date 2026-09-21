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

export const EVRIM_QUANTITY_UNIT_CODES = {
  adet: "ADET",
  pcs: "ADET",
  piece: "ADET",
  pieces: "ADET",
} as const;

function clean(value: string): string {
  return value.trim();
}

function key(value: string): string {
  return clean(value).toLocaleLowerCase("tr-TR");
}

export function mapEvrimPackageType(value: string): string {
  return EVRIM_PACKAGE_TYPE_CODES[key(value) as keyof typeof EVRIM_PACKAGE_TYPE_CODES] ?? value;
}

export function mapEvrimQuantityUnit(value: string): string {
  return EVRIM_QUANTITY_UNIT_CODES[key(value) as keyof typeof EVRIM_QUANTITY_UNIT_CODES]
    ?? value.toLocaleUpperCase("tr-TR");
}
