import { Copy, Send, Pencil } from 'lucide-react';
import type { CustomerAddress, EvrimStatus } from '../../types';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';

// ─── Evrim status pill ────────────────────────────────────────────────────────

function evrimLabel(status: EvrimStatus, changed: boolean): string {
  if (status === 'sent' && !changed) return 'Sisteme Gönderildi';
  if (changed) return 'Sistem Güncellemesi Bekliyor';
  return 'Yerel Kayıt';
}

type EvrimVariant = 'sent' | 'pending' | 'local';

function evrimVariant(status: EvrimStatus, changed: boolean): EvrimVariant {
  if (status === 'sent' && !changed) return 'sent';
  if (changed) return 'pending';
  return 'local';
}

const EVRIM_STYLES: Record<EvrimVariant, string> = {
  sent:    'bg-ok-tint text-ok',
  pending: 'bg-warn-tint text-warn',
  local:   'bg-surface-2 text-muted border border-line',
};

function EvrimPill({ status, changed }: { status: EvrimStatus; changed: boolean }) {
  const variant = evrimVariant(status, changed);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-[9px] py-[3px] rounded-full ${EVRIM_STYLES[variant]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {evrimLabel(status, changed)}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddressTabProps {
  addresses: CustomerAddress[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onSendEvrim: () => void;
  onCopy: () => void;
  onNew: () => void;
  onEdit: () => void;
}

export default function AddressTab({
  addresses,
  selectedIdx,
  onSelect,
  onSendEvrim,
  onCopy,
  onNew,
  onEdit,
}: AddressTabProps) {
  const sel = addresses[selectedIdx];

  // ─── Address detail text for the letter box ────────────────────────────────
  function letterLines(addr: CustomerAddress) {
    return addr.addressLines.split('\n');
  }

  const isSent = sel?.evrimStatus === 'sent' && !sel?.changed;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left: address list */}
      <Card>
        <CardHead
          title="Adres Kayıtları"
          sub="Aynı adres farklı işlemlerde gönderici veya alıcı olabilir."
          actions={
            <Button variant="primary" size="sm" icon={Pencil} onClick={onNew}>
              Yeni Adres
            </Button>
          }
        />
        <CardBody>
          <div className="space-y-2">
            {addresses.length === 0 && (
              <p className="text-muted text-[13px]">Henüz adres tanımlı değil.</p>
            )}
            {addresses.map((addr, i) => (
              <button
                key={addr.id}
                onClick={() => onSelect(i)}
                className={[
                  'w-full text-left px-3.5 py-3 rounded-[8px] border transition-colors',
                  i === selectedIdx
                    ? 'border-accent bg-accent-tint'
                    : 'border-line bg-surface-2 hover:border-muted-2',
                ].join(' ')}
              >
                <div className="font-bold text-[13.5px] text-text-strong leading-snug">{addr.company}</div>
                <div className="text-[12.5px] text-muted mt-1 leading-relaxed">
                  {addr.addressLines.split('\n').map((l, li) => (
                    <span key={li} className="block">{l}</span>
                  ))}
                  <span className="block">{addr.country}</span>
                </div>
                <div className="mt-2">
                  <EvrimPill status={addr.evrimStatus} changed={addr.changed} />
                </div>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Right: address preview */}
      <Card>
        <CardHead
          title="Adres Görünümü"
          sub="Fatura / beyanname üzerinde kullanılacak format"
          actions={
            <Button size="sm" icon={Copy} onClick={onCopy}>
              Kopyala
            </Button>
          }
        />
        {sel ? (
          <CardBody>
            {/* Letter format */}
            <div className="bg-surface-2 border border-line rounded-[8px] px-4 py-4 mb-4 leading-relaxed font-[inherit]">
              <div className="text-[11px] font-bold uppercase tracking-[.1em] text-muted">SAYIN</div>
              <div className="font-bold text-[15px] text-text-strong mt-1">{sel.company}</div>
              {letterLines(sel).map((l, i) => (
                <div key={i} className="text-text text-[13px]">{l}</div>
              ))}
              <div className="text-text text-[13px] mt-1.5">{sel.country}</div>
              <div className="font-mono text-[12px] text-muted mt-1.5">VKN: {sel.taxNo}</div>
            </div>

            {/* Field grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {[
                { label: 'Firma',         value: sel.company  },
                { label: 'Ülke',          value: sel.country  },
                { label: 'Şehir / Bölge', value: sel.city     },
                { label: 'VKN / Tax No',  value: sel.taxNo, mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="bg-surface-2 border border-line rounded-[8px] px-3 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-[.08em] text-muted">{label}</div>
                  <div className={`font-semibold text-text-strong mt-0.5 text-[13.5px] ${mono ? 'font-mono' : ''}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* System registration box */}
            <div
              className="flex items-center gap-3 rounded-[9px] px-4 py-3 mb-4"
              style={{ background: '#eef4fa', border: '1px solid #bbd1e8' }}
            >
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13px]" style={{ color: 'var(--hat-blue)' }}>Sistem Kayıt Durumu</div>
                <div className="text-[12px] mt-0.5 leading-snug" style={{ color: '#4a6a85' }}>
                  {isSent
                    ? 'Bu adres sisteme gönderildi.'
                    : sel.changed
                    ? 'Adres düzenlendi — Sistem güncellemesi gönderilmeli.'
                    : 'Bu adres henüz sisteme gönderilmedi.'}
                </div>
              </div>
              <div className="shrink-0">
                <Button
                  variant="blue"
                  size="sm"
                  icon={Send}
                  disabled={isSent}
                  onClick={onSendEvrim}
                  className="whitespace-nowrap"
                >
                  {isSent ? 'Sistemde Güncel' : 'Sisteme Kayıt Gönder'}
                </Button>
              </div>
            </div>

            {/* Edit button */}
            <div>
              <Button icon={Pencil} size="sm" onClick={onEdit}>
                Adresi Düzenle
              </Button>
            </div>
          </CardBody>
        ) : (
          <CardBody>
            <p className="text-muted text-[13px]">Bir adres seçin.</p>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
