import { useRef, useState, useEffect } from 'react';
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Warehouse, LayoutGrid, ChevronDown, Lock } from 'lucide-react';

export type ActiveTransactionType = 'ithalat' | 'ihracat' | 'transit' | 'tumu';

interface Option {
  value: ActiveTransactionType;
  label: string;
  Icon: typeof ArrowUpRight;
  disabled?: boolean;
}

const OPTIONS: Option[] = [
  { value: 'ithalat', label: 'İthalat',                Icon: ArrowDownLeft },
  { value: 'ihracat', label: 'İhracat',                Icon: ArrowUpRight },
  { value: 'transit', label: 'Transit',                Icon: ArrowLeftRight },
];

interface TransactionTypeSelectorProps {
  value: ActiveTransactionType;
  onChange: (v: ActiveTransactionType) => void;
}

const ICON_MAP: Record<ActiveTransactionType, typeof ArrowUpRight> = {
  ihracat: ArrowUpRight,
  ithalat: ArrowDownLeft,
  transit: ArrowLeftRight,
  tumu:    LayoutGrid,
};

export default function TransactionTypeSelector({ value, onChange }: TransactionTypeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const ActiveIcon = ICON_MAP[value];
  const activeLabel = value === 'tumu' ? 'Tümü' : OPTIONS.find((o) => o.value === value)?.label ?? 'İhracat';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2.5 bg-ink text-white border-0 rounded-[9px] px-3 py-2 font-bold text-[13px] cursor-pointer"
      >
        <ActiveIcon size={15} strokeWidth={2} className="text-white" />
        <span>
          <span className="block text-[9.5px] tracking-[.14em] uppercase text-[#7fb0aa] font-bold leading-none">İşlem Tipi</span>
          <span className="flex items-center gap-1.5 mt-0.5">{activeLabel}</span>
        </span>
        <ChevronDown size={13} strokeWidth={2.2} className="opacity-70 ml-0.5" />
      </button>

      {open && (
        <div className="absolute top-[52px] left-0 bg-surface border border-line-strong rounded-[10px] shadow-lg w-[230px] py-1.5 z-40">
          {OPTIONS.map(({ value: v, label, Icon }) => (
            <button
              key={v}
              onClick={() => { onChange(v); setOpen(false); }}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-semibold rounded-[7px] mx-1 transition-colors',
                v === value
                  ? 'bg-accent-tint text-accent'
                  : 'text-text hover:bg-surface-2',
              ].join(' ')}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <Icon size={16} strokeWidth={2} className={v === value ? 'text-accent' : 'text-muted'} />
              {label}
            </button>
          ))}

          {/* Antrepo — disabled */}
          <button
            disabled
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-semibold text-text rounded-[7px] mx-1 opacity-50 cursor-not-allowed"
            style={{ width: 'calc(100% - 8px)' }}
          >
            <Warehouse size={16} strokeWidth={2} className="text-muted" />
            Antrepo
            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-2 font-semibold">
              <Lock size={11} strokeWidth={2} />
              Yetki yok
            </span>
          </button>

          {/* Tümü separator */}
          <div className="border-t border-line mt-1.5 mb-1" />
          <button
            onClick={() => { onChange('tumu'); setOpen(false); }}
            className={[
              'w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-semibold rounded-[7px] mx-1 transition-colors',
              value === 'tumu'
                ? 'bg-accent-tint text-accent'
                : 'text-text hover:bg-surface-2',
            ].join(' ')}
            style={{ width: 'calc(100% - 8px)' }}
          >
            <LayoutGrid size={16} strokeWidth={2} className={value === 'tumu' ? 'text-accent' : 'text-muted'} />
            Tümü (yetkili olunan)
          </button>
        </div>
      )}
    </div>
  );
}
