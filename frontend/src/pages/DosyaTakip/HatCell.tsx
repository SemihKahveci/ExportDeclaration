import type { HatColor } from '../../types';

const HAT_CONFIG: Record<HatColor, { label: string; varName: string }> = {
  kirmizi: { label: 'Kırmızı', varName: 'var(--hat-red)' },
  sari:    { label: 'Sarı',    varName: 'var(--hat-yellow)' },
  mavi:    { label: 'Mavi',    varName: 'var(--hat-blue)' },
  yesil:   { label: 'Yeşil',  varName: 'var(--hat-green)' },
};

const HAT_ALIASES: Record<string, HatColor> = {
  kirmizi: 'kirmizi',
  'kırmızı': 'kirmizi',
  sari: 'sari',
  'sarı': 'sari',
  mavi: 'mavi',
  yesil: 'yesil',
  'yeşil': 'yesil',
};

export default function HatCell({ line }: { line: string | null }) {
  if (!line) return <span className="text-muted-2">—</span>;
  const key = HAT_ALIASES[line.trim().toLocaleLowerCase('tr-TR')];
  const cfg = key ? HAT_CONFIG[key] : undefined;
  if (!cfg) return <span className="text-[12.5px] text-text-strong">{line}</span>;
  const { label, varName } = cfg;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-[12.5px]" style={{ color: varName }}>
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: varName, boxShadow: `0 0 0 3px rgba(0,0,0,0.04)` }}
      />
      {label}
    </span>
  );
}
