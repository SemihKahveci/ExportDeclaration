import { useEffect, useState } from 'react';
import { RefreshCw, Send, CheckCircle2, Info, Loader2 } from 'lucide-react';
import type { TescilRecord, TescilPageStats } from '../../types';
import { tescilService } from '../../services/declarations';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import Timeline from '../../components/ui/Timeline';
import LineCard from '../../components/ui/LineCard';
import { useToast } from '../../components/ui/Toast';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type LineColor = 'Kırmızı' | 'Sarı' | 'Mavi' | 'Yeşil';
const ALL_LINES: LineColor[] = ['Kırmızı', 'Sarı', 'Mavi', 'Yeşil'];

function linePillVariant(line: LineColor): 'red' | 'yellow' | 'blue' | 'green' {
  const map: Record<LineColor, 'red' | 'yellow' | 'blue' | 'green'> = {
    Kırmızı: 'red', Sarı: 'yellow', Mavi: 'blue', Yeşil: 'green',
  };
  return map[line];
}

function agingStyle(rec: TescilRecord): { text: string; color: string; weight: string } {
  if (rec.status === 'completed') {
    return { text: `${rec.days} günde tamamlandı`, color: 'var(--ok)', weight: '500' };
  }
  if (rec.days <= 2) return { text: `${rec.days} gündür`, color: 'var(--text-strong)', weight: '500' };
  if (rec.days <= 5) return { text: `${rec.days} gündür`, color: 'var(--warn)', weight: '600' };
  return { text: `${rec.days} gündür`, color: 'var(--hat-red)', weight: '700' };
}

function agingPillVariant(rec: TescilRecord): 'ok' | 'warn' | 'red' {
  if (rec.status === 'completed') return 'ok';
  if (rec.days <= 2) return 'ok';
  if (rec.days <= 5) return 'warn';
  return 'red';
}

function buildTimeline(rec: TescilRecord) {
  return [
    {
      title: 'Beyanname tescil talebi oluşturuldu',
      meta: 'Sistem API üzerinden tescil süreci başlatıldı',
      state: 'done' as const,
    },
    {
      title: `İlk bildirim alındı · ${rec.line} Hat`,
      meta: `${rec.type} için hat bilgisi Sistemden geldi`,
      state: 'done' as const,
    },
    {
      title: rec.hasSecondNotif ? 'İkinci bildirim alındı' : 'İkinci bildirim bekleniyor',
      meta: rec.hasSecondNotif
        ? 'Tescil süreci tamamlandı'
        : 'Süreç tamamlanma bildirimi henüz gelmedi',
      state: rec.hasSecondNotif ? ('done' as const) : ('wait' as const),
    },
    {
      title: rec.status === 'completed' ? 'Müşteri bilgilendirildi' : 'Müşteri bekleme durumunda',
      meta: rec.status === 'completed'
        ? 'Tamamlandı bildirimi gönderildi'
        : 'Tamamlandı bildirimi ikinci bildirimden sonra gönderilecek',
      state: rec.status === 'completed' ? ('done' as const) : ('wait' as const),
    },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StageCard({ active, done, no, title, desc }: {
  active: boolean;
  done: boolean;
  no: number;
  title: string;
  desc: string;
}) {
  const containerCls = done
    ? 'border-[var(--hat-green)] bg-[#eef6f0]'
    : active
    ? 'border-accent bg-accent-tint'
    : 'border-line-strong bg-surface-2';

  const noCls = done
    ? 'bg-[var(--hat-green)] text-white'
    : active
    ? 'bg-accent text-white'
    : 'bg-line text-muted-2';

  return (
    <div className={`rounded-xl p-4 border-2 transition-colors ${containerCls}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold mb-2.5 ${noCls}`}>
        {done ? <CheckCircle2 size={14} strokeWidth={2.5} /> : no}
      </div>
      <div className="text-[13.5px] font-bold text-text-strong">{title}</div>
      <div className="text-[12px] text-muted mt-1.5 leading-snug">{desc}</div>
    </div>
  );
}

function HatTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-2 hover:text-muted transition-colors"
        aria-label="Hat bilgisi"
      >
        <Info size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute left-5 top-0 z-20 w-64 bg-surface border border-line rounded-lg shadow-lg p-3 text-[12px] text-muted leading-snug">
          <p className="font-semibold text-text-strong mb-1">Hat Renkleri</p>
          <p>
            <span className="font-semibold">İthalat:</span> Kırmızı, Sarı, Yeşil
          </p>
          <p className="mt-0.5">
            <span className="font-semibold">İhracat:</span> Kırmızı, Sarı, Mavi, Yeşil. Mavi/Yeşil hatta ikinci bildirim alınsa bile sarı/kırmızıya düşme kontrolü takip edilir.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BeyannameTescilPage() {
  const { toast } = useToast();

  const [loading,   setLoading]   = useState(true);
  const [records,   setRecords]   = useState<TescilRecord[]>([]);
  const [stats,     setStats]     = useState<TescilPageStats | null>(null);
  const [selectedId, setSelectedId] = useState<string>('tsc-001');

  useEffect(() => {
    Promise.all([
      tescilService.getRecords(),
      tescilService.getStats(),
    ]).then(([recs, s]) => {
      setRecords(recs);
      setStats(s);
      setLoading(false);
    });
  }, []);

  const selected = records.find((r) => r.id === selectedId) ?? null;

  function handleSelect(rec: TescilRecord) {
    setSelectedId(rec.id);
    toast(`${rec.ref} seçildi`);
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
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">Beyanname Tescil</h1>
          <p className="text-[12.5px] text-muted mt-1 max-w-[580px]">
            Beyannamenin tescil sürecinin başladığını ve tamamlandığını iki aşamalı takip edin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => toast('Sistem durumları yenilendi')}
          >
            Sistem Durumunu Yenile
          </Button>
          <Button
            variant="primary"
            icon={Send}
            onClick={() => toast('Müşteri bildirimi gönderildi')}
          >
            Müşteriye Bildir
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.waiting}           label="Tescil bekleyen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.started}           label="Süreç başladı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.completed}         label="Tamamlandı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.yellowRed}         label="Sarı / kırmızı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-red)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.blueGreenTracking} label="Mavi / yeşil takip" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-green)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Master-detail layout */}
      <div className="grid grid-cols-[340px_1fr] gap-4 items-start">
        {/* Left: File list */}
        <Card>
          <CardHead title="Beyannameler" sub="Tescil sürecindeki dosyalar" />
          <CardBody>
            <div className="flex flex-col gap-2.5">
              {records.map((rec) => {
                const isSelected = rec.id === selectedId;
                const aging = agingStyle(rec);
                return (
                  <button
                    key={rec.id}
                    onClick={() => handleSelect(rec)}
                    className={[
                      'text-left w-full border rounded-xl px-3 py-3 transition-all duration-150',
                      isSelected
                        ? 'border-accent bg-accent-tint shadow-sm'
                        : 'border-line-strong bg-surface hover:border-muted-2',
                    ].join(' ')}
                  >
                    <div className="font-bold text-[14px] text-text-strong">{rec.ref}</div>
                    <div className="text-[12px] text-muted mt-0.5">{rec.customer}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Pill variant={rec.status === 'completed' ? 'ok' : 'warn'}>
                        {rec.status === 'completed' ? 'Tamamlandı' : 'Süreç Başladı'}
                      </Pill>
                      <Pill variant={linePillVariant(rec.line)}>
                        {rec.line} Hat
                      </Pill>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Pill variant={agingPillVariant(rec)}>
                        {aging.text}
                      </Pill>
                    </div>
                    <div className="text-[11.5px] text-muted mt-1.5 font-mono">
                      {rec.type} · {rec.tescilNo}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* Right: Detail */}
        {selected && (
          <Card>
            <CardHead
              title={`${selected.ref} · ${selected.type} Beyannamesi`}
              sub={`${selected.tescilNo} · ${selected.customer}`}
              actions={
                <Pill variant={selected.status === 'completed' ? 'ok' : 'warn'}>
                  {selected.status === 'completed' ? 'Tamamlandı' : 'Süreç Başladı'}
                </Pill>
              }
            />
            <CardBody>
              {/* Two-stage process */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <StageCard
                  active={selected.status !== 'completed'}
                  done={false}
                  no={1}
                  title="Tescil Süreci Başladı"
                  desc="Sistemden ilk durum bildirimi alınır. Hangi hatta düştüğü bu aşamada gösterilir."
                />
                <StageCard
                  active={selected.status === 'completed'}
                  done={selected.status === 'completed'}
                  no={2}
                  title="Tescil Süreci Tamamlandı"
                  desc="Sistemden ikinci bildirim geldiğinde süreç tamamlanır ve müşteri bilgilendirilir."
                />
              </div>

              {/* KV fields */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-surface-2 border border-line rounded-xl px-3.5">
                  {[
                    { label: 'Beyanname Türü', value: selected.type },
                    { label: 'İlk Bildirim',   value: 'Alındı' },
                    { label: 'İkinci Bildirim', value: selected.hasSecondNotif ? 'Alındı' : 'Bekleniyor' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4 py-2.5 border-b border-line last:border-b-0">
                      <span className="text-[12.5px] font-semibold text-muted">{label}</span>
                      <span className="text-[12.5px] font-medium text-text-strong text-right">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-surface-2 border border-line rounded-xl px-3.5">
                  {[
                    { label: 'Mevcut Hat',        value: `${selected.line} Hat` },
                    { label: 'Risk Kontrolü',      value: selected.risk },
                    { label: 'Müşteri Bildirimi',  value: selected.status === 'completed' ? 'Tamamlandı bildirimi gönderildi' : 'Başladı bildirimi gönderildi' },
                    { label: 'Son Güncelleme',     value: selected.updatedAt },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-4 py-2.5 border-b border-line last:border-b-0">
                      <span className="text-[12.5px] font-semibold text-muted shrink-0">{label}</span>
                      <span className="text-[12.5px] font-medium text-text-strong text-right">{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 py-2.5">
                    <span className="text-[12.5px] font-semibold text-muted">Tescil Aşamasında</span>
                    <span
                      className="text-[12.5px] text-right font-medium"
                      style={{ color: agingStyle(selected).color, fontWeight: agingStyle(selected).weight }}
                    >
                      {agingStyle(selected).text}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hat status section */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] uppercase tracking-widest font-semibold text-muted">
                  Hat Durumu
                </span>
                <HatTooltip />
              </div>
              <div className="grid grid-cols-4 gap-2.5 mb-5">
                {ALL_LINES.map((line) => (
                  <LineCard
                    key={line}
                    line={line}
                    active={selected.line === line}
                    label={selected.line === line ? `${line} · Mevcut hat` : line}
                  />
                ))}
              </div>

              {/* Timeline */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] uppercase tracking-widest font-semibold text-muted">
                  Tescil Olay Akışı · Sistem Bildirimleri
                </span>
              </div>
              <Timeline events={buildTimeline(selected)} />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
