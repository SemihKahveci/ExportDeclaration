import type { FileStatus } from '../../types';
import Pill from '../../components/ui/Pill';
import type { ComponentProps } from 'react';

type PillVariant = ComponentProps<typeof Pill>['variant'];

const STATUS_CONFIG: Record<FileStatus, { label: string; variant: PillVariant }> = {
  'yeni-talep':        { label: 'Yeni Talep',          variant: 'accent' },
  'gtip-hazirlik':     { label: 'Evrak Bekleniyor',    variant: 'warn' },
  'gtip-eksik':        { label: 'GTİP Eksik/Hatalı',   variant: 'red' },
  'evrak-bekleniyor':  { label: 'Evrak Bekleniyor',    variant: 'warn' },
  'beyanname-yazim':   { label: 'Beyanname Yazımda',   variant: 'blue' },
  'ic-kontrol':        { label: 'Beyanname Yazım Onayında', variant: 'gray' },
  'tescil':            { label: 'Tescilde',             variant: 'blue' },
  'kapanis-bekleyen':  { label: 'Kapanış Bekleyen',    variant: 'yellow' },
  'kapandi':           { label: 'Kapandı',              variant: 'green' },
  'beklemede':         { label: 'Beklemede',            variant: 'warn' },
};

export function fileStatusLabel(status: FileStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

export default function FileStatusPill({ status }: { status: FileStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Pill variant={cfg.variant}>{cfg.label}</Pill>;
}
