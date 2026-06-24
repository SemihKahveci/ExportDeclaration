import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Warehouse, LayoutGrid } from 'lucide-react';
import type { TransactionType } from '../../types';

const ALL_TYPES: TransactionType[] = ['ithalat', 'ihracat', 'transit', 'antrepo'];

const TYPE_CONFIG: Record<TransactionType, { label: string; Icon: typeof ArrowUpRight }> = {
  ihracat:  { label: 'İhracat',  Icon: ArrowUpRight  },
  ithalat:  { label: 'İthalat',  Icon: ArrowDownLeft },
  transit:  { label: 'Transit',  Icon: ArrowLeftRight },
  antrepo:  { label: 'Antrepo',  Icon: Warehouse     },
};

export default function TransactionTypeBadge({ types }: { types: TransactionType[] }) {
  const isAll = ALL_TYPES.every((t) => types.includes(t));

  if (isAll) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2 py-1 rounded-[6px] bg-ink text-white whitespace-nowrap">
        <LayoutGrid size={12} strokeWidth={2} className="text-[#9ecbc5]" />
        Tümü
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {types.map((t) => {
        const { label, Icon } = TYPE_CONFIG[t];
        return (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2 py-1 rounded-[6px] whitespace-nowrap"
            style={{ background: '#f0ede4', color: 'var(--text)' }}
          >
            <Icon size={12} strokeWidth={2} className="text-muted" />
            {label}
          </span>
        );
      })}
    </span>
  );
}
