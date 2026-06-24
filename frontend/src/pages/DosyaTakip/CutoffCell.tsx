function calcOpenDays(receivedAt: string): number {
  const start = new Date(receivedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000);
}

interface OpenDaysCellProps {
  receivedAt: string;
  escalation: boolean;
}

export default function OpenDaysCell({ receivedAt, escalation }: OpenDaysCellProps) {
  const days = calcOpenDays(receivedAt);

  const label = days === 0 ? 'Bugün' : days === 1 ? '1 gün' : `${days} gün`;

  if (!escalation) {
    return <span className="text-[13px] text-text tabular-nums">{label}</span>;
  }

  const color = days >= 14 ? 'var(--hat-red)' : 'var(--warn)';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold tabular-nums"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {label}
    </span>
  );
}
