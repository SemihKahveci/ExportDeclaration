import type { LucideIcon } from 'lucide-react';

export interface TabItem {
  key: string;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export default function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex border-b border-line ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors select-none',
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text hover:border-line-strong',
            ].join(' ')}
          >
            {Icon && <Icon size={14} strokeWidth={1.75} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
