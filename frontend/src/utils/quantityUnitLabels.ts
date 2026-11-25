/** Yazım ekranı birim metni. Excel tarafı kod basmaya devam eder (EA/NIU→C62 vb.). */
const UNIT_LABELS: Record<string, string> = {
  ea: "Adet",
  niu: "Adet",
  c62: "Adet",
  adet: "Adet",
  pcs: "Adet",
  piece: "Adet",
  pieces: "Adet",
  kgm: "Kilogram",
  kg: "Kilogram",
  kilogram: "Kilogram",
  mtk: "Metrekare",
  set: "Set",
  ltr: "Litre",
  mtr: "Metre",
  tne: "Ton",
  to: "Ton",
};

export function quantityUnitLabel(value: string | undefined | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = raw.toLocaleLowerCase("en-US");
  return UNIT_LABELS[key] ?? raw;
}
