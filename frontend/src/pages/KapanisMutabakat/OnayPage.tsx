import { useEffect, useState } from 'react';
import { CheckCheck, RotateCcw, Loader2, FileText, Banknote, AlertCircle } from 'lucide-react';
import type { KapanicFile, KapanicPageStats } from '../../types';
import { kapanisService } from '../../services/declarations';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusPillVariant(status: KapanicFile['status']): 'ok' | 'warn' | 'gray' | 'accent' {
  switch (status) {
    case 'mutabakat-hazir':  return 'ok';
    case 'kontrol-bekliyor': return 'warn';
    case 'maliyet-bekliyor': return 'warn';
    case 'kapandi':          return 'gray';
  }
}

function statusLabel(status: KapanicFile['status']): string {
  switch (status) {
    case 'kontrol-bekliyor': return 'Kontrol Bekliyor';
    case 'mutabakat-hazir':  return 'Mutabakat Hazır';
    case 'maliyet-bekliyor': return 'Maliyet Bekliyor';
    case 'kapandi':          return 'Kapandı';
  }
}

// ─── Status check row ─────────────────────────────────────────────────────────

function StatusRow({ icon: Icon, label, status, detail }: {
  icon: typeof FileText;
  label: string;
  status: 'ok' | 'warn' | 'pending';
  detail: string;
}) {
  const dotColor = status === 'ok' ? 'bg-ok' : status === 'warn' ? 'bg-warn' : 'bg-muted-2';
  const textColor = status === 'ok' ? 'text-ok' : status === 'warn' ? 'text-warn' : 'text-muted';
  const statusText = status === 'ok' ? 'Hazır' : status === 'warn' ? 'Eksik' : 'Bekliyor';

  return (
    <div className="flex items-center gap-3 py-3 border-b border-line last:border-b-0">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${status === 'ok' ? 'bg-ok/10' : status === 'warn' ? 'bg-warn/10' : 'bg-surface-2'}`}>
        <Icon size={13} className={textColor} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-text-strong">{label}</div>
        <div className="text-[11.5px] text-muted mt-0.5">{detail}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className={`text-[12px] font-semibold ${textColor}`}>{statusText}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KapanicOnayPage() {
  const { toast } = useToast();

  const [loading,    setLoading]    = useState(true);
  const [files,      setFiles]      = useState<KapanicFile[]>([]);
  const [stats,      setStats]      = useState<KapanicPageStats | null>(null);
  const [selectedId, setSelectedId] = useState<string>('kap-001');

  useEffect(() => {
    Promise.all([
      kapanisService.getFiles(),
      kapanisService.getStats(),
    ]).then(([f, s]) => {
      setFiles(f);
      setStats(s);
      setLoading(false);
    });
  }, []);

  const selected = files.find((f) => f.id === selectedId) ?? null;

  function handleSelectFile(file: KapanicFile) {
    setSelectedId(file.id);
    toast(`${file.ref} seçildi`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-[13px]">Yükleniyor…</span>
      </div>
    );
  }

  // Mock approval state per selected file
  const evrakDurumu   = selected?.status === 'mutabakat-hazir' ? 'ok' : selected?.status === 'kapandi' ? 'ok' : 'warn';
  const maliyetDurumu = selected?.status === 'maliyet-bekliyor' ? 'warn' : selected?.status === 'kapandi' ? 'ok' : 'ok';
  const canApprove    = evrakDurumu === 'ok' && maliyetDurumu === 'ok';

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
            Kapanış Onay
          </h1>
          <p className="text-[12.5px] text-muted mt-1 max-w-[600px]">
            Kapanış ve mutabakat sürecinde onay bekleyen dosyaları yönetin.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.waiting}     label="Kapanış bekleyen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.uploaded}    label="Evrak yüklenen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.reconciled}  label="Mutabakat hazır" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-green)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.warnings}    label="Kontrol uyarısı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-red)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.costPending} label="Maliyet bekleyen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Master-detail layout */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '288px 1fr' }}>
        {/* Left: file list */}
        <Card className="self-start">
          <CardHead title="Onay Bekleyen Dosyalar" sub="Kapanış onayına hazır beyannameler" />
          <div>
            {files.map((f) => (
              <div
                key={f.id}
                onClick={() => handleSelectFile(f)}
                className={[
                  'px-4 py-3.5 border-b border-line last:border-0 cursor-pointer transition-colors hover:bg-surface-2',
                  f.id === selectedId ? 'bg-accent-tint' : '',
                ].join(' ')}
              >
                <div className="text-[13.5px] font-bold text-text-strong">{f.ref}</div>
                <div className="text-[12.5px] text-muted mt-0.5">{f.customer}</div>
                <div className="mt-2">
                  <Pill variant={statusPillVariant(f.status)}>{statusLabel(f.status)}</Pill>
                </div>
                <div className="text-[11.5px] text-muted-2 font-mono mt-1.5">{f.tescilNo}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Right: detail */}
        {selected && (
          <div className="space-y-4">
            {/* File summary */}
            <Card>
              <CardHead
                title={`${selected.ref} · Kapanış Onay`}
                sub={`${selected.tescilNo} · ${selected.customer}`}
                actions={
                  <Pill variant={statusPillVariant(selected.status)}>
                    {statusLabel(selected.status)}
                  </Pill>
                }
              />
              <CardBody>
                <div className="bg-surface-2 border border-line rounded-xl px-3.5 mb-5">
                  {[
                    { label: 'Beyanname No',   value: selected.tescilNo,      mono: true  },
                    { label: 'Müşteri',         value: selected.customer,      mono: false },
                    { label: 'Tescil Durumu',   value: selected.tescilDurumu,  pill: 'ok'   as const },
                    { label: 'Kapanış Durumu',  value: selected.kapanicDurumu, pill: selected.status === 'kapandi' ? 'gray' as const : 'warn' as const },
                  ].map(({ label, value, mono, pill }) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-2.5 border-b border-line last:border-b-0">
                      <span className="text-[12.5px] font-semibold text-muted shrink-0">{label}</span>
                      {pill ? (
                        <Pill variant={pill}>{value}</Pill>
                      ) : (
                        <span className={`text-[12.5px] font-medium text-text-strong text-right ${mono ? 'font-mono' : ''}`}>
                          {value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Approval checklist */}
            <Card>
              <CardHead title="Onay Öncesi Durum Kontrolü" sub="Onay verebilmek için tüm kontrollerin geçmesi gerekir" />
              <CardBody>
                <div className="rounded-xl border border-line bg-surface">
                  <StatusRow
                    icon={FileText}
                    label="Evrak Durumu"
                    status={evrakDurumu as 'ok' | 'warn'}
                    detail={evrakDurumu === 'ok' ? 'Tüm zorunlu evraklar mevcut' : 'Eksik veya bekleyen evrak var'}
                  />
                  <StatusRow
                    icon={Banknote}
                    label="Maliyet Durumu"
                    status={maliyetDurumu as 'ok' | 'warn'}
                    detail={maliyetDurumu === 'ok' ? 'Maliyet kalemleri onaylı' : 'Maliyet girişi bekleniyor'}
                  />
                </div>

                {!canApprove && (
                  <div className="flex items-start gap-2.5 mt-4 p-3.5 rounded-xl bg-warn-tint border border-warn/30">
                    <AlertCircle size={15} className="text-warn shrink-0 mt-0.5" strokeWidth={2} />
                    <p className="text-[12.5px] text-warn leading-relaxed">
                      Onay verebilmek için tüm kontrollerin yeşil olması gerekiyor. Eksiklikleri giderin.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-line">
                  <Button
                    icon={RotateCcw}
                    onClick={() => toast(`${selected.ref} geri gönderildi`)}
                  >
                    Geri Gönder
                  </Button>
                  <Button
                    variant="primary"
                    icon={CheckCheck}
                    disabled={!canApprove}
                    onClick={() => toast(`${selected.ref} onaylandı ve kapatıldı`)}
                  >
                    Onayla
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
