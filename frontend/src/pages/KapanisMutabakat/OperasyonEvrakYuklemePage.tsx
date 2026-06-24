import { useEffect, useState } from 'react';
import {
  Bell, CheckCircle, Zap, Loader2,
} from 'lucide-react';
import type { KapanicFile, KapanicControlItem, KapanicPageStats, ControlState } from '../../types';
import { kapanisService } from '../../services/declarations';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import UploadBox from '../../components/ui/UploadBox';
import { useToast } from '../../components/ui/Toast';
import { CheckCircle as CheckCircleIcon, Clock } from 'lucide-react';

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

// ─── Control card ─────────────────────────────────────────────────────────────

function ControlCard({ item, state }: { item: KapanicControlItem; state: ControlState }) {
  const isOk = state === 'ok';
  const isMutabakat = item.id === 'ctl-006';
  const finalState: ControlState = isOk && isMutabakat ? 'wait' : state;

  return (
    <div
      className={[
        'flex items-start gap-3 rounded-xl border p-3.5',
        finalState === 'ok'
          ? 'border-[#bfe0d8] bg-accent-tint'
          : 'border-[#e8d0a2] bg-warn-tint',
      ].join(' ')}
    >
      <span
        className={[
          'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          finalState === 'ok'
            ? 'bg-[var(--hat-green)] text-white'
            : 'bg-warn text-white',
        ].join(' ')}
      >
        {finalState === 'ok'
          ? <CheckCircleIcon size={13} strokeWidth={2.5} />
          : <Clock size={13} strokeWidth={2} />
        }
      </span>
      <div>
        <div className="text-[13px] font-bold text-text-strong">{item.label}</div>
        <div className="text-[12px] text-muted mt-0.5">
          {finalState === 'ok' ? item.subOk : item.subDefault}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KapanicOperasyonEvrakYuklemePage() {
  const { toast } = useToast();

  const [loading,      setLoading]      = useState(true);
  const [files,        setFiles]        = useState<KapanicFile[]>([]);
  const [controls,     setControls]     = useState<KapanicControlItem[]>([]);
  const [stats,        setStats]        = useState<KapanicPageStats | null>(null);
  const [selectedId,   setSelectedId]   = useState<string>('kap-001');
  const [controlState, setControlState] = useState<ControlState>('wait');
  const [autoChecked,  setAutoChecked]  = useState(false);

  useEffect(() => {
    Promise.all([
      kapanisService.getFiles(),
      kapanisService.getControls(),
      kapanisService.getStats(),
    ]).then(([f, ctl, s]) => {
      setFiles(f);
      setControls(ctl);
      setStats(s);
      setLoading(false);
    });
  }, []);

  const selected = files.find((f) => f.id === selectedId) ?? null;

  function handleSelectFile(file: KapanicFile) {
    setSelectedId(file.id);
    setControlState('wait');
    setAutoChecked(false);
    toast(`${file.ref} seçildi`);
  }

  function handleRunAutoCheck() {
    setControlState('ok');
    setAutoChecked(true);
    toast('Otomatik kontrol tamamlandı');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-[13px]">Yükleniyor…</span>
      </div>
    );
  }

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
            Operasyon Evrak Yükleme
          </h1>
          <p className="text-[12.5px] text-muted mt-1 max-w-[600px]">
            Teslim tesellüm belgesi ve mühürlü evrakları yükleyin, otomatik kontrol başlatın.
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
          <CardHead title="Beyannameler" sub="Kapanış aşamasındaki dosyalar" />
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
                title={`${selected.ref} · Operasyon Evrak Yükleme`}
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

                {/* Upload boxes */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <UploadBox
                    title="Teslim Tesellüm Belgesi Yükle"
                    hint="PDF, JPG veya mobil fotoğraf yüklenebilir."
                    multiple={false}
                    onFiles={(files) => toast(`${files[0].name} yüklendi`)}
                  />
                  <UploadBox
                    title="Mühürlü Evrakları Yükle"
                    hint="Beyanname ve varsa diğer mühürlü evrak görselleri."
                    multiple={true}
                    onFiles={(files) => toast(`${files.length} dosya yüklendi`)}
                  />
                </div>

                {/* Auto check */}
                <div className="flex justify-end mb-4">
                  <Button variant="blue" icon={Zap} onClick={handleRunAutoCheck}>
                    Otomatik Kontrolü Başlat
                  </Button>
                </div>

                {/* Control cards */}
                <div className="grid grid-cols-3 gap-2.5 mb-5">
                  {controls.map((item) => (
                    <ControlCard key={item.id} item={item} state={controlState} />
                  ))}
                </div>

                {/* Footer actions */}
                <div className="flex justify-end gap-2">
                  <Button icon={Bell} onClick={() => toast('Operasyona mutabakat hazır bildirimi gönderildi')}>
                    Operasyona Mutabakat Hazır Bildir
                  </Button>
                  <Button
                    variant="primary"
                    icon={CheckCircle}
                    disabled={!autoChecked}
                    onClick={() => toast('Kapanış onayı kaydedildi')}
                  >
                    Kapanışı Onayla
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
