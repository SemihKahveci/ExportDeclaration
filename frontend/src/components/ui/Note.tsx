import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

type NoteVariant = 'warn' | 'ok' | 'info';

interface NoteProps {
  variant?: NoteVariant;
  children: ReactNode;
}

const CONFIGS: Record<NoteVariant, { icon: typeof AlertTriangle; bg: string; border: string; text: string; iconColor: string }> = {
  warn: {
    icon: AlertTriangle,
    bg: 'bg-warn-tint',
    border: 'border-warn/40',
    text: 'text-text',
    iconColor: 'var(--warn)',
  },
  ok: {
    icon: CheckCircle,
    bg: 'bg-ok-tint',
    border: 'border-ok/40',
    text: 'text-text',
    iconColor: 'var(--ok)',
  },
  info: {
    icon: Info,
    bg: 'bg-accent-tint',
    border: 'border-accent/30',
    text: 'text-text',
    iconColor: 'var(--accent)',
  },
};

export default function Note({ variant = 'info', children }: NoteProps) {
  const cfg = CONFIGS[variant];
  const Icon = cfg.icon;
  return (
    <div
      className={`flex gap-3 px-4 py-3 rounded border text-[13px] leading-relaxed ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      <Icon size={15} strokeWidth={1.75} className="shrink-0 mt-0.5" style={{ color: cfg.iconColor }} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
