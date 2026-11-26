/** TR para/miktar metnini sayıya çevirir (1.234,56 → 1234.56; 10.710 → 10710). */
export function parseTrNumber(value: string | undefined | null): number {
  const raw = String(value ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "");
  if (!raw || raw === "—" || raw === "–" || raw === "-") return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    normalized =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  } else if (hasDot) {
    const parts = raw.split(".");
    // "10.710" / "1.234.567" → binlik ayırıcı
    if (parts.length > 1 && parts.slice(1).every((part) => part.length === 3)) {
      normalized = raw.replace(/\./g, "");
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
