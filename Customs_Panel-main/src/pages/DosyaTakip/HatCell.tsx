import type { HatColor } from '../../types';

const HAT_CONFIG: Record<HatColor, { label: string; varName: string }> = {
  kirmizi: { label: 'Kırmızı', varName: 'var(--hat-red)' },
  sari:    { label: 'Sarı',    varName: 'var(--hat-yellow)' },
  mavi:    { label: 'Mavi',    varName: 'var(--hat-blue)' },
  yesil:   { label: 'Yeşil',  varName: 'var(--hat-green)' },
};

export default function HatCell({ line }: { line: HatColor | null }) {
  if (!line) return <span className="text-muted-2">—</span>;
  const { label, varName } = HAT_CONFIG[line];
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
