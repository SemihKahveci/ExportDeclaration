import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import type { BeyannameDocCheckItem } from '../../types';

interface DocChecklistProps {
  docs: BeyannameDocCheckItem[];
}

const STATUS_CONFIG = {
  geldi: {
    icon: CheckCircle2,
    color: 'text-ok',
    bg: 'bg-ok/8',
    label: 'Geldi',
  },
  eksik: {
    icon: AlertCircle,
    color: 'text-warn',
    bg: 'bg-warn/8',
    label: 'Eksik',
  },
  kosullu: {
    icon: HelpCircle,
    color: 'text-muted',
    bg: 'bg-surface-2',
    label: 'Koşullu',
  },
};

export default function DocChecklist({ docs }: DocChecklistProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {docs.map((doc) => {
        const cfg = STATUS_CONFIG[doc.status];
        const Icon = cfg.icon;
        return (
          <div
            key={doc.id}
            className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${cfg.bg}`}
          >
            <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-text-strong truncate">{doc.name}</span>
                <span className={`text-[11px] font-medium ${cfg.color} shrink-0`}>{cfg.label}</span>
              </div>
              {doc.note && (
                <p className="text-[11px] text-muted mt-0.5 leading-snug">{doc.note}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
