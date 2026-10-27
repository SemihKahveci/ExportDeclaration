const WEIGHT_UNITS = new Set([
  "kg",
  "kgs",
  "kgm",
  "kilogram",
  "kilogrami",
  "kilogramı",
  "kilo",
  "ton",
  "tonne",
  "t",
  "netkg",
]);

export function isWeightUnit(unit: string | undefined): boolean {
  const token = (unit ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\./g, "")
    .replace(/\s+/g, "");
  if (!token) return false;
  return WEIGHT_UNITS.has(token) || token.includes("kilogram") || token.startsWith("ton");
}
