import type { ReactNode } from 'react';

type PillVariant = 'ok' | 'warn' | 'red' | 'yellow' | 'blue' | 'green' | 'accent' | 'gray';

interface PillProps {
  variant?: PillVariant;
  children: ReactNode;
}

const STYLES: Record<PillVariant, { bg: string; text: string; dot: string }> = {
  ok:     { bg: 'bg-ok-tint',      text: 'text-ok',       dot: 'bg-ok' },
  warn:   { bg: 'bg-warn-tint',    text: 'text-warn',     dot: 'bg-warn' },
  red:    { bg: '[background:var(--hat-red)]/10', text: '[color:var(--hat-red)]', dot: '[background:var(--hat-red)]' },
  yellow: { bg: '[background:var(--hat-yellow)]/10', text: '[color:var(--hat-yellow)]', dot: '[background:var(--hat-yellow)]' },
  blue:   { bg: '[background:var(--hat-blue)]/10',   text: '[color:var(--hat-blue)]',   dot: '[background:var(--hat-blue)]' },
  green:  { bg: '[background:var(--hat-green)]/10',  text: '[color:var(--hat-green)]',  dot: '[background:var(--hat-green)]' },
  accent: { bg: 'bg-accent-tint',  text: 'text-accent',   dot: 'bg-accent' },
  gray:   { bg: 'bg-surface-2',    text: 'text-muted',    dot: 'bg-muted-2' },
};

const INLINE_BG: Record<PillVariant, string | undefined> = {
  ok: undefined, warn: undefined, accent: undefined, gray: undefined,
  red:    'rgba(207,64,64,0.12)',
  yellow: 'rgba(211,149,36,0.12)',
  blue:   'rgba(53,119,189,0.12)',
  green:  'rgba(58,153,104,0.12)',
};

const INLINE_COLOR: Record<PillVariant, string | undefined> = {
  ok: undefined, warn: undefined, accent: undefined, gray: undefined,
  red:    'var(--hat-red)',
  yellow: 'var(--hat-yellow)',
  blue:   'var(--hat-blue)',
  green:  'var(--hat-green)',
};

export default function Pill({ variant = 'gray', children }: PillProps) {
  const s = STYLES[variant];
  const inlineBg = INLINE_BG[variant];
  const inlineColor = INLINE_COLOR[variant];

  const isHat = ['red', 'yellow', 'blue', 'green'].includes(variant);

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium leading-none',
        !isHat ? s.bg : '',
        !isHat ? s.text : '',
      ].join(' ')}
      style={isHat ? { background: inlineBg, color: inlineColor } : undefined}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${!isHat ? s.dot : ''}`}
        style={isHat ? { background: inlineColor } : undefined}
      />
      {children}
    </span>
  );
}
