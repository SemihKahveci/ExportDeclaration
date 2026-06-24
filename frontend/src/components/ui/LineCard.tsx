import { Check } from 'lucide-react';

type LineColor = 'Kırmızı' | 'Sarı' | 'Mavi' | 'Yeşil';

interface LineCardProps {
  line: LineColor;
  active: boolean;
  label: string;
}

const LINE_CONFIG: Record<LineColor, { hatVar: string; label: string }> = {
  Kırmızı: { hatVar: 'var(--hat-red)',    label: 'Kırmızı Hat' },
  Sarı:    { hatVar: 'var(--hat-yellow)', label: 'Sarı Hat' },
  Mavi:    { hatVar: 'var(--hat-blue)',   label: 'Mavi Hat' },
  Yeşil:   { hatVar: 'var(--hat-green)',  label: 'Yeşil Hat' },
};

export default function LineCard({ line, active, label }: LineCardProps) {
  const cfg = LINE_CONFIG[line];

  if (!active) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded border border-line bg-surface-2">
        <span className="w-3 h-3 rounded-full bg-muted-2 shrink-0" />
        <span className="text-[13px] text-muted">{label || cfg.label}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded border-2"
      style={{
        borderColor: cfg.hatVar,
        background: `color-mix(in srgb, ${cfg.hatVar} 10%, transparent)`,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${cfg.hatVar} 20%, transparent)`,
      }}
    >
      <span
        className="w-3 h-3 rounded-full shrink-0 flex items-center justify-center"
        style={{ background: cfg.hatVar }}
      >
        <Check size={8} color="white" strokeWidth={3} />
      </span>
      <span
        className="text-[13px] font-semibold"
        style={{ color: cfg.hatVar }}
      >
        {label || cfg.label}
      </span>
    </div>
  );
}
