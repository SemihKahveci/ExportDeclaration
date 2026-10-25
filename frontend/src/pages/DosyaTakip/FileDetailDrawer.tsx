import type { CustomsFile, FileStatus, SystemMailRecord } from '../../types';
import Drawer from '../../components/ui/Drawer';
import { Card, CardBody } from '../../components/ui/Card';
import Timeline from '../../components/ui/Timeline';
import Pill from '../../components/ui/Pill';
import { useToast } from '../../components/ui/Toast';
import FileStatusPill, { fileStatusLabel } from './FileStatusPill';
import TransportIcon from './TransportIcon';
import HatCell from './HatCell';
import AssigneeCell from './AssigneeCell';
import OpenDaysCell from './CutoffCell';

interface FileDetailDrawerProps {
  file: CustomsFile | null;
  onClose: () => void;
}

const FLOW: FileStatus[] = [
  'yeni-talep',
  'evrak-bekleniyor',
  'gtip-hazirlik',
  'beyanname-yazim',
  'ic-kontrol',
  'tescil',
  'kapanis-bekleyen',
  'kapandi',
];

function isFileStatus(value: string | undefined): value is FileStatus {
  return Boolean(value && FLOW.includes(value as FileStatus)) || value === 'gtip-eksik' || value === 'beklemede';
}

function timelineFor(file: CustomsFile) {
  const held = file.status === 'beklemede';
  const anchor = held && isFileStatus(file.holdPreviousStatus) && file.holdPreviousStatus !== 'beklemede'
    ? file.holdPreviousStatus
    : file.status;
  const steps = FLOW.map((status) => (status === 'gtip-hazirlik' && anchor === 'gtip-eksik' ? 'gtip-eksik' : status));
  const index = Math.max(0, steps.indexOf(anchor === 'beklemede' ? 'yeni-talep' : anchor));
  return steps.map((step, position) => ({
    title: held && position === index ? fileStatusLabel('beklemede') : fileStatusLabel(step),
    meta: position < index
      ? 'Tamamlandı'
      : position === index
        ? (held ? (file.holdNote || file.lastActivity || 'Devam ediyor') : (file.lastActivity || 'Devam ediyor'))
        : 'Henüz başlamadı',
    state: position < index ? 'done' as const : position === index ? 'wait' as const : 'default' as const,
  }));
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-line last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted w-32 shrink-0 mt-0.5">{label}</span>
      <span className="text-[13px] text-text flex-1">{children}</span>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

const STATUS_PILL: Record<SystemMailRecord['status'], { variant: 'ok' | 'gray' | 'warn'; label: string }> = {
  sent:     { variant: 'ok',   label: 'Gönderildi' },
  not_sent: { variant: 'gray', label: 'Gönderilmedi' },
  failed:   { variant: 'warn', label: 'Hatalı' },
};

function MailHistoryRow({ record, onDetail }: { record: SystemMailRecord; onDetail: () => void }) {
  const pill = STATUS_PILL[record.status];
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-semibold text-text-strong leading-snug truncate">{record.type}</p>
        <p className="text-[11.5px] text-muted mt-0.5">
          {record.sentCount} kez
          {record.lastSentAt ? <span className="mx-1">·</span> : null}
          {record.lastSentAt ? <span>Son: {formatDate(record.lastSentAt)}</span> : null}
        </p>
      </div>
      <Pill variant={pill.variant}>{pill.label}</Pill>
      <button
        type="button"
        onClick={onDetail}
        className="text-[11.5px] text-accent font-medium hover:underline shrink-0"
      >
        Detayı Gör
      </button>
    </div>
  );
}

export default function FileDetailDrawer({ file, onClose }: FileDetailDrawerProps) {
  const { toast } = useToast();
  const timeline = file ? timelineFor(file) : [];

  return (
    <Drawer
      open={!!file}
      onClose={onClose}
      title={file?.ref ?? ''}
      subtitle={file ? `${file.customer} · ${file.customerCity}` : undefined}
    >
      {file && (
        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-0 divide-y divide-line p-0 px-5">
              <InfoRow label="Statü"><FileStatusPill status={file.status} /></InfoRow>
              <InfoRow label="Taşıma"><TransportIcon mode={file.transportMode} /></InfoRow>
              <InfoRow label="Hat"><HatCell line={file.line} /></InfoRow>
              <InfoRow label="Sorumlu"><AssigneeCell assignee={file.assignee} /></InfoRow>
              {file.declarationNo && (
                <InfoRow label="Beyanname">
                  <span className="font-mono text-[12px] text-text-strong">{file.declarationNo}</span>
                </InfoRow>
              )}
              <InfoRow label="Açık Gün">
                <OpenDaysCell receivedAt={file.receivedAt} escalation={file.escalation} />
              </InfoRow>
              <InfoRow label="Son Hareket">
                <span className="text-muted">{file.lastActivity}</span>
              </InfoRow>
            </CardBody>
          </Card>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3">Süreç Durumu</p>
            <Timeline events={timeline} />
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3">Sistem Mail Geçmişi</p>
            <Card>
              <CardBody className="p-0 px-4">
                {file.systemMailHistory.map((record) => (
                  <MailHistoryRow
                    key={record.type}
                    record={record}
                    onDetail={() => toast(`${record.type} · ${record.sentCount} gönderim · Son: ${formatDate(record.lastSentAt)}`)}
                  />
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </Drawer>
  );
}
