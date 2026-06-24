import type { FileStatus } from '../../types';
import Pill from '../../components/ui/Pill';
import type { ComponentProps } from 'react';

type PillVariant = ComponentProps<typeof Pill>['variant'];

const STATUS_CONFIG: Record<FileStatus, { label: string; variant: PillVariant }> = {
  'yeni-talep':        { label: 'Yeni Talep',          variant: 'accent' },
  'gtip-hazirlik':     { label: 'GTİP Hazırlıkta',     variant: 'ok' },
  'evrak-bekleniyor':  { label: 'Evrak Bekleniyor',    variant: 'warn' },
  'beyanname-yazim':   { label: 'Beyanname Yazımda',   variant: 'blue' },
  'ic-kontrol':        { label: 'İç Kontrolde',        variant: 'gray' },
  'tescil':            { label: 'Tescilde',             variant: 'blue' },
  'kapanis-bekleyen':  { label: 'Kapanış Bekleyen',    variant: 'yellow' },
  'kapandi':           { label: 'Kapandı',              variant: 'green' },
};

export default function FileStatusPill({ status }: { status: FileStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Pill variant={cfg.variant}>{cfg.label}</Pill>;
}
