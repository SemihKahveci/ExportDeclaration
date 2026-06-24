import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-surface rounded border border-line shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

interface CardHeadProps {
  title: string;
  sub?: string;
  actions?: ReactNode;
}

export function CardHead({ title, sub, actions }: CardHeadProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-text-strong leading-snug">{title}</h3>
        {sub && <p className="text-[12px] text-muted mt-0.5">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {children}
    </div>
  );
}
