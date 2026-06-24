import { Plus, Pencil } from 'lucide-react';
import type { MailDomain, CustomerMail } from '../../types';
import { Card, CardHead } from '../../components/ui/Card';
import { Table, Th, Td, Tr } from '../../components/ui/Table';
import Button from '../../components/ui/Button';

// ─── Small status badge ───────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${active ? 'text-ok' : 'text-muted'}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {active ? 'Aktif' : 'Pasif'}
    </span>
  );
}

interface MailTabProps {
  domains: MailDomain[];
  mails: CustomerMail[];
  onNewDomain: () => void;
  onEditDomain: (idx: number) => void;
  onNewMail: () => void;
  onEditMail: (idx: number) => void;
}

export default function MailTab({
  domains,
  mails,
  onNewDomain,
  onEditDomain,
  onNewMail,
  onEditMail,
}: MailTabProps) {
  return (
    <div className="space-y-4">
      {/* Domain definitions */}
      <Card>
        <CardHead
          title="Mail Domain Tanımları"
          sub="Gelen maillerin müşteriye otomatik eşleştirilmesi için domain/uzantı tanımları."
          actions={
            <Button variant="primary" size="sm" icon={Plus} onClick={onNewDomain}>
              Yeni Domain
            </Button>
          }
        />
        <div className="px-5 py-4 space-y-2">
          {domains.length === 0 && (
            <p className="text-muted text-[13px]">Henüz domain tanımlı değil.</p>
          )}
          {domains.map((d, i) => (
            <div
              key={d.id}
              className="flex items-center gap-3 px-3 py-2.5 border border-line bg-surface-2 rounded-[8px]"
            >
              <span className="font-mono text-[12px] font-semibold bg-line px-2 py-1 rounded-[6px] text-text-strong">
                {d.domain}
              </span>
              <span className="text-[12.5px] text-muted flex-1 min-w-0 truncate">{d.note}</span>
              <StatusBadge active={d.matchStatus === 'active'} />
              <Button size="sm" onClick={() => onEditDomain(i)}>
                Düzenle
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Customer mail addresses */}
      <Card>
        <CardHead
          title="Müşteri Mail Adresleri"
          sub="Bu mailler Evrim'e gönderilmez. Bildirim süreçleri Ayarlar > Bildirim Süreçleri'nden gelir."
          actions={
            <Button variant="primary" size="sm" icon={Plus} onClick={onNewMail}>
              Yeni Mail
            </Button>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Mail Adresi</Th>
              <Th>Domain</Th>
              <Th>Kişi / Birim</Th>
              <Th>Eşleştirme</Th>
              <Th>Bildirim Süreçleri</Th>
              <Th>Durum</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {mails.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted text-[13px]">
                  Henüz mail tanımı yok.
                </td>
              </tr>
            ) : (
              mails.map((m, i) => (
                <Tr key={m.id}>
                  <Td><span className="font-semibold text-text-strong">{m.email}</span></Td>
                  <Td>
                    <span className="font-mono text-[12px] font-semibold bg-line px-2 py-1 rounded-[6px] text-text-strong">
                      {m.domain}
                    </span>
                  </Td>
                  <Td><span className="text-[13px]">{m.owner}</span></Td>
                  <Td><StatusBadge active={m.matchStatus === 'active'} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {m.notificationProcesses.map((p) => (
                        <span key={p} className="inline-flex items-center text-[11.5px] font-semibold px-2 py-1 rounded-[6px] bg-surface-2 border border-line text-text whitespace-nowrap">
                          {p}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td><StatusBadge active={m.status === 'active'} /></Td>
                  <Td className="w-px">
                    <button
                      onClick={() => onEditMail(i)}
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
          Sistem müşteriden mail geldiğinde domain kontrolü yapar. Eşleştirme aktifse müşteriyi otomatik tespit eder. Bildirim süreçleri Ayarlar &gt; Bildirim Süreçleri'nden seçilir.
        </div>
      </Card>
    </div>
  );
}
