import { Plus, Pencil } from 'lucide-react';
import type { NotificationRule, NotifyWorkingMode } from '../../types';
import { Card, CardHead } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Button from '../../components/ui/Button';

// ─── Badges ───────────────────────────────────────────────────────────────────

const MODE_STYLES: Record<NotifyWorkingMode, string> = {
  Otomatik:  'bg-ok-tint text-ok',
  Kontrollü: 'bg-[#e8f0f8] text-[var(--hat-blue)]',
  Manuel:    'bg-surface-2 text-muted border border-line',
  Kapalı:    'bg-surface-2 text-muted border border-line',
};

function displayWorkingMode(mode: NotifyWorkingMode): string {
  return mode === 'Manuel' ? 'Kapalı' : mode;
}

function ModeBadge({ mode }: { mode: NotifyWorkingMode }) {
  const label = displayWorkingMode(mode);
  const cls = MODE_STYLES[mode === 'Manuel' ? 'Kapalı' : mode] ?? 'bg-surface-2 text-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-[10px] py-[4px] rounded-full ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: 'Aktif' | 'Pasif' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${status === 'Aktif' ? 'text-ok' : 'text-muted'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {status}
    </span>
  );
}

// ─── Summary tiles ────────────────────────────────────────────────────────────

interface SummaryTileProps {
  count: number;
  label: string;
}

function SummaryTile({ count, label }: SummaryTileProps) {
  return (
    <div className="bg-surface border border-line rounded-[9px] px-[14px] py-3">
      <div className="text-[26px] font-bold text-text-strong leading-none">{count}</div>
      <div className="text-[12px] text-muted font-semibold mt-1">{label}</div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotifyRulesTabProps {
  rules: NotificationRule[];
  onNew: () => void;
  onEdit: (idx: number) => void;
}

export default function NotifyRulesTab({ rules, onNew, onEdit }: NotifyRulesTabProps) {
  const counts = {
    auto:       rules.filter((r) => r.workingMode === 'Otomatik').length,
    controlled: rules.filter((r) => r.workingMode === 'Kontrollü').length,
    closed:     rules.filter((r) => r.workingMode === 'Kapalı' || r.workingMode === 'Manuel').length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile count={counts.auto}       label="Otomatik"  />
        <SummaryTile count={counts.controlled} label="Kontrollü" />
        <SummaryTile count={counts.closed}     label="Kapalı"    />
      </div>

      <Card>
        <CardHead
          title="Bildirim Kuralları"
          sub="İşlem bazında bildirimin nasıl çalışacağı müşteri özelinde tanımlanır."
          actions={
            <Button variant="primary" size="sm" icon={Plus} onClick={onNew}>
              Yeni Bildirim Kuralı
            </Button>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>İşlem / Bildirim Süreci</Th>
              <Th>Çalışma Şekli</Th>
              <Th>Kanal</Th>
              <Th>Alıcı Kuralı</Th>
              <Th>Durum</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted text-[13px]">
                  Bildirim kuralı tanımlı değil.
                </td>
              </tr>
            ) : (
              rules.map((r, i) => (
                <Tr key={r.id}>
                  <Td><span className="font-semibold text-text-strong">{r.process}</span></Td>
                  <Td><ModeBadge mode={r.workingMode} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.channels.length === 0 ? (
                        <span className="text-muted text-[12.5px]">—</span>
                      ) : (
                        r.channels.map((c) => (
                          <span key={c} className="inline-flex text-[11.5px] font-semibold px-2 py-1 rounded-[6px] bg-surface-2 border border-line text-text whitespace-nowrap">
                            {c}
                          </span>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td><span className="text-muted text-[12.5px]">{r.recipientRule}</span></Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="w-px">
                    <button
                      onClick={() => onEdit(i)}
                      className="text-muted-2 hover:text-accent transition-colors"
                    >
                      <Pencil size={15} strokeWidth={2} />
                    </button>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
        <div className="px-5 py-3 text-[12px] text-muted-2 leading-relaxed border-t border-line">
          Otomatik: sistem tetikler. Kontrollü: sistem hazırlar, operatör onaylar. Kapalı: bu süreç için müşteriye bildirim gitmez.
        </div>
      </Card>
    </div>
  );
}
