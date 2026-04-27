/**
 * Alıcı adresinin son kelimesi genelde ülkedir (örn. "... VESZPREM Hungary" → Hungary).
 * Son token rakam veya bilinen şehir kodu değilse kabul edilir.
 */
const NOT_COUNTRY_LAST_TOKEN = new Set(
  [
    "VESZPREM",
    "ISTANBUL",
    "İSTANBUL",
    "ANKARA",
    "İZMİR",
    "IZMIR",
    "KONYA",
    "BURSA",
    "ADANA",
    "HRSZ",
    "UTCA"
  ].map((s) => s.toUpperCase())
);

export function inferBuyerCountryFromAddressString(address: string): string | undefined {
  const normalized = address.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;
  const raw = tokens[tokens.length - 1]!;
  const last = raw.replace(/[,;:.]+$/g, "").trim();
  if (last.length < 3 || last.length > 56) return undefined;
  if (/\d/.test(last)) return undefined;
  if (!/^[\p{L}]+$/u.test(last)) return undefined;
  if (NOT_COUNTRY_LAST_TOKEN.has(last.toUpperCase())) return undefined;
  return last;
}
