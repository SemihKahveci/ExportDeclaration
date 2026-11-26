/** Parse/UBL birim → Evrim EDI kodu (C62 vb.). */
const HARD_UNIT_TO_EDI: Record<string, string> = {
  niu: 'C62',
  ea: 'C62',
  adet: 'C62',
  ad: 'C62',
  pcs: 'C62',
  piece: 'C62',
  pieces: 'C62',
  c62: 'C62',
  kg: 'KGM',
  kgm: 'KGM',
  kilogram: 'KGM',
  kgr: 'KGM',
  mtk: 'MTK',
  m2: 'MTK',
  set: 'SET',
  ltr: 'LTR',
  lt: 'LTR',
  mtr: 'MTR',
  mt: 'MTR',
  tne: 'TNE',
  to: 'TNE',
  pr: 'PR',
  çift: 'PR',
  cift: 'PR',
  pairs: 'PR',
};

export type MiktarOption = {
  ediKodu: string;
  label: string;
  aliases?: string[];
  aciklamaTr?: string;
  aciklamaIng?: string;
  cevrimKodu?: string;
};

function norm(value: string): string {
  // en-US: Türkçe I→ı tuzağı birim kodlarını (NIU) bozmasın.
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Ham parse birimini select value (EDI) yapar. */
export function resolveMiktarEdi(
  raw: string | undefined | null,
  options: MiktarOption[]
): string {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '–' || text === '-') return '';

  const upper = text.toUpperCase();
  const key = norm(text);
  const hard = HARD_UNIT_TO_EDI[key];
  if (hard && (options.length === 0 || options.some((opt) => opt.ediKodu === hard))) {
    return hard;
  }

  if (options.some((opt) => opt.ediKodu === upper)) return upper;
  if (options.some((opt) => opt.ediKodu === text)) return text;

  const hit = options.find((opt) => {
    const aliases = [
      opt.ediKodu,
      opt.label,
      opt.aciklamaTr,
      opt.aciklamaIng,
      opt.cevrimKodu,
      ...(opt.aliases ?? []),
    ]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean);
    return aliases.some((alias) => {
      const a = norm(alias);
      return a === key || a.endsWith(` ${key}`) || a.includes(`· ${key}`) || a.includes(key);
    });
  });
  return hit?.ediKodu ?? '';
}
