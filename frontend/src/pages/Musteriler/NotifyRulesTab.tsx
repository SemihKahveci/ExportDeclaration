import { Plus, Pencil } from 'lucide-react';
import type { NotificationRule, NotifyWorkingMode } from '../../types';
import { Card, CardHead } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Button from '../../components/ui/Button';

// ─── Badges ───────────────────────────────────────────────────────────────────

const MODE_STYLES: Record<NotifyWorkingMode, string> = {
  Otomatik:  'bg-ok-tint text-ok',
  Kontrollü: 'bg-[#e8f0f8] text-[var(--hat-blue)]',
  Manuel:    'bg-warn-tint text-warn',
  Kapalı:    'bg-surface-2 text-muted border border-line',
};

function ModeBadge({ mode }: { mode: NotifyWorkingMode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-[10px] py-[4px] rounded-full ${MODE_STYLES[mode]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {mode}
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
    manual:     rules.filter((r) => r.workingMode === 'Manuel').length,
    closed:     rules.filter((r) => r.workingMode === 'Kapalı').length,
  };

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryTile count={counts.auto}       label="Otomatik"  />
        <SummaryTile count={counts.controlled} label="Kontrollü" />
        <SummaryTile count={counts.manual}     label="Manuel"    />
        <SummaryTile count={counts.closed}     label="Kapalı"    />
      </div>

      {/* Table */}
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
              <Th>Onay Gerekir</Th>
              <Th>Durum</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted text-[13px]">
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
                  <Td><span className="text-[13px]">{r.requiresApproval ? 'Evet' : 'Hayır'}</span></Td>
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
          Otomatik: sistem tetikler. Kontrollü: sistem hazırlar, operatör onaylar. Manuel: operatör zamanlar ve gönderir. Kapalı: bu süreç için müşteriye bildirim gitmez.
        </div>
      </Card>
    </div>
  );
}
