/** Parse menşe metni → Evrim Ulke_No. Karşılıklar yalnızca evrim-veri Mense satırlarından (aliases). */

export type MenseOption = {
  ulkeNo: string;
  label: string;
  ulkeKodu?: string;
  ulke?: string;
  yUlke?: string;
  aliases?: string[];
};

function norm(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function aliasList(opt: MenseOption): string[] {
  return [
    opt.ulkeNo,
    opt.ulkeKodu,
    opt.ulke,
    opt.yUlke,
    opt.label,
    ...(opt.aliases ?? []),
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);
}

/** Ham parse menşesini select value (Ulke_No) yapar — Excel alias’larıyla. */
export function resolveMenseUlkeNo(
  raw: string | undefined | null,
  options: MenseOption[]
): string {
  const text = String(raw ?? '').trim();
  if (!text || text === '—' || text === '–' || text === '-') return '';
  if (options.length === 0) return '';

  if (/^\d{1,3}$/.test(text)) {
    const padded = text.padStart(3, '0');
    if (options.some((opt) => opt.ulkeNo === padded)) return padded;
  }

  const key = norm(text);

  const exact = options.find((opt) =>
    aliasList(opt).some((alias) => norm(alias) === key)
  );
  if (exact) return exact.ulkeNo;

  // "CN - CHINA", "Menşe: CHINA" gibi birleşik metinler
  const partial = options.find((opt) =>
    aliasList(opt).some((alias) => {
      const a = norm(alias);
      if (a.length < 2) return false;
      return key.includes(a) || a.includes(key);
    })
  );
  return partial?.ulkeNo ?? '';
}
