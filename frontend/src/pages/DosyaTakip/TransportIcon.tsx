import type { TransportMode } from '../../types';
import { Truck, Ship, Plane } from 'lucide-react';

const CONFIG: Record<TransportMode, { Icon: typeof Truck; label: string }> = {
  karayolu:  { Icon: Truck,  label: 'Karayolu' },
  denizyolu: { Icon: Ship,   label: 'Denizyolu' },
  havayolu:  { Icon: Plane,  label: 'Havayolu' },
};

export default function TransportIcon({ mode }: { mode: TransportMode | null }) {
  if (!mode) return <span className="text-muted-2">—</span>;
  const { Icon, label } = CONFIG[mode];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-text">
      <Icon size={14} strokeWidth={1.75} className="text-muted shrink-0" />
      {label}
    </span>
  );
}
