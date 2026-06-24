interface StatCardProps {
  value: string | number;
  label: string;
  className?: string;
}

export default function StatCard({ value, label, className = '' }: StatCardProps) {
  return (
    <div className={`bg-surface rounded border border-line shadow-card px-5 py-4 ${className}`}>
      <p className="text-[26px] font-semibold text-text-strong leading-none tabular-nums">{value}</p>
      <p className="text-[12px] text-muted mt-1.5 leading-snug">{label}</p>
    </div>
  );
}
