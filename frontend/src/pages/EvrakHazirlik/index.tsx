import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckSquare, Bell, Loader2, Info } from 'lucide-react';
import type { EvrakFile, EvrakDocRow, EvrakConflictRow, DocPreviewData, EvrakPageStats } from '../../types';
import { evrakService } from '../../services/documents';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import DocStatusTab from './DocStatusTab';
import ConflictsTab from './ConflictsTab';
import PreviewDrawer from './PreviewDrawer';

// ─── Tab bar with tooltip ─────────────────────────────────────────────────────

const TAB_TOOLTIPS: Record<string, string> = {
  docs:      'Bu liste müşteri bazlı evrak kurallarından gelir. Tüm zorunlu evraklar geldiğinde "Beyanname Yazmaya Başla" aktif olur. Eksik varsa yetkiye göre "Eksik Evrakla Yaz" ile başlatılabilir.',
  conflicts: 'Eksik evraklar ve farklı dokümanlarda çelişen alanlar burada birlikte gösterilir. Sonradan gelen evrakların beyannameye dahil edilmesi Beyanname Yazım & Kontrol\'de yönetilir.',
};

function TabButton({
  tabKey, label, active, onClick,
}: { tabKey: string; label: string; active: boolean; onClick: () => void }) {
  const [tip, setTip] = useState(false);
  return (
    <div className="relative flex items-center">
      <button
        onClick={onClick}
        className={[
          'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors select-none',
          active
            ? 'border-accent text-accent'
            : 'border-transparent text-muted hover:text-text hover:border-line-strong',
        ].join(' ')}
      >
        {label}
      </button>
      <div
        className="relative flex items-center mr-2"
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
      >
        <Info
          size={13}
          strokeWidth={1.75}
          className={`cursor-default transition-colors ${active ? 'text-accent opacity-60 hover:opacity-100' : 'text-muted-2 hover:text-muted'}`}
        />
        {tip && (
          <div
            className="absolute left-1/2 top-full mt-2 z-50 pointer-events-none"
            style={{ transform: 'translateX(-50%)' }}
          >
            <div
              className="mx-auto w-0 h-0 mb-[-1px]"
              style={{
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '6px solid var(--line-strong)',
                marginLeft: '50%',
                transform: 'translateX(-50%)',
              }}
            />
            <div
              className="bg-surface border border-line-strong rounded-[8px] shadow-card px-3.5 py-3 text-[12.5px] text-text leading-relaxed"
              style={{ maxWidth: 380, minWidth: 260 }}
            >
              {TAB_TOOLTIPS[tabKey]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Decision box ─────────────────────────────────────────────────────────────

function DecisionBox({ allReady }: { allReady: boolean }) {
  if (allReady) {
    return (
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-[9px] px-4 py-3.5 bg-ok-tint border border-ok/30">
          <h3 className="text-[13.5px] font-bold text-text-strong mb-1">Tüm evraklar hazır</h3>
          <p className="text-[12.5px] text-muted leading-relaxed">
            <strong>Beyanname Yazmaya Başla</strong> butonu aktif. Tüm alanlar yazım ekranına aktarılmaya hazır.
          </p>
        </div>
        <div className="rounded-[9px] px-4 py-3.5 bg-ok-tint border border-ok/30">
          <h3 className="text-[13.5px] font-bold text-text-strong mb-1">Eksiksiz kontrol tamamlandı</h3>
          <p className="text-[12.5px] text-muted leading-relaxed">
            Herhangi bir uyumsuzluk veya eksik evrak tespit edilmedi. Beyanname yazım süreci başlatılabilir.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 mb-5">
      <div className="rounded-[9px] px-4 py-3.5 bg-warn-tint border border-warn/30">
        <h3 className="text-[13.5px] font-bold text-text-strong mb-1">Eksik evrak var</h3>
        <p className="text-[12.5px] text-muted leading-relaxed">
          Bu dosyada zorunlu/koşullu evrak eksikleri var. Yetkiye göre{' '}
          <strong>Eksik Evrakla Yaz</strong> seçeneğiyle beyanname yazımını başlatabilirsiniz.
        </p>
      </div>
      <div className="rounded-[9px] px-4 py-3.5 bg-ok-tint border border-ok/30">
        <h3 className="text-[13.5px] font-bold text-text-strong mb-1">Tüm evraklar hazır olduğunda</h3>
        <p className="text-[12.5px] text-muted leading-relaxed">
          Eksik evrak kalmadığında <strong>Beyanname Yazmaya Başla</strong> aktif olur. Bu aşamada alanlar
          yazım ekranına aktarılır.
        </p>
      </div>
    </div>
  );
}

// ─── File list item ───────────────────────────────────────────────────────────

function filePillVariant(f: EvrakFile) {
  if (f.allReady) return 'ok' as const;
  if (f.meta.includes('eksik')) return 'warn' as const;
  return 'gray' as const;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvrakHazirlikPage() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get('ref');

  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('docs');

  const [files, setFiles]       = useState<EvrakFile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [docs, setDocs]         = useState<EvrakDocRow[]>([]);
  const [conflicts, setConflicts] = useState<EvrakConflictRow[]>([]);
  const [stats, setStats]       = useState<EvrakPageStats | null>(null);

  // Preview drawer
  const [previewOpen, setPreviewOpen]  = useState(false);
  const [previewData, setPreviewData]  = useState<DocPreviewData | null>(null);

  const selectedFile = files.find((f) => f.id === selectedId);

  // Initial load
  useEffect(() => {
    Promise.all([evrakService.getFiles(), evrakService.getStats()]).then(([fs, st]) => {
      setFiles(fs);
      setStats(st);
      if (fs.length) {
        const match = refParam ? fs.find((f) => f.ref === refParam) : null;
        setSelectedId(match ? match.id : fs[0].id);
      }
      setLoading(false);
    });
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Load docs + conflicts when selected file changes
  useEffect(() => {
    if (!selectedId) return;
    Promise.all([
      evrakService.getDocs(selectedId),
      evrakService.getConflicts(selectedId),
    ]).then(([d, c]) => {
      setDocs(d);
      setConflicts(c);
    });
  }, [selectedId]);

  async function handlePreview(docName: string) {
    const data = await evrakService.getPreview(docName);
    setPreviewData(data);
    setPreviewOpen(true);
  }

  function handleSelectFile(id: string, ref: string) {
    setSelectedId(id);
    toast(ref + ' seçildi');
  }

  return (
    <div className="px-7 pt-6 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">Evrak Hazırlık</h1>
          <p className="text-[12.5px] text-muted mt-1">
            Beyanname yazımı için gerekli evrakları, gelen evrakları, alan kaynaklarını ve veri uyumsuzluklarını kontrol et.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            icon={AlertTriangle}
            disabled={selectedFile?.allReady ?? false}
            onClick={() => toast('Eksik evrakla yazım başlatıldı. Sonradan gelen evraklar yazım ekranında değerlendirilecek.')}
            style={
              !(selectedFile?.allReady ?? false)
                ? { background: 'var(--warn-tint)', borderColor: '#e8d0a2', color: '#7a5a16' }
                : undefined
            }
          >
            Eksik Evrakla Yaz
          </Button>
          <Button
            variant="primary"
            icon={CheckSquare}
            disabled={!(selectedFile?.allReady ?? false)}
            onClick={() => toast('Tüm evraklar hazır. Beyanname yazım süreci başlatılır.')}
          >
            Beyanname Yazmaya Başla
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.required}       label="Gerekli Evrak" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.received}       label="Gelen Evrak" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.missing}        label="Eksik Evrak" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--warn)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.fieldConflicts} label="Alan Uyumsuzluğu" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-red)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.parsedFields}   label="Parse Edilen Alan" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[13px]">Yükleniyor…</span>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: '288px 1fr' }}>
          {/* File list */}
          <Card className="self-start">
            <CardHead title="Beyannameler" sub="Evrak hazırlığı bekleyen dosyalar" />
            <div>
              {files.map((f) => (
                <div
                  key={f.id}
                  onClick={() => handleSelectFile(f.id, f.ref)}
                  className={[
                    'px-4 py-3.5 border-b border-line last:border-0 cursor-pointer transition-colors hover:bg-surface-2',
                    f.id === selectedId ? 'bg-accent-tint' : '',
                  ].join(' ')}
                >
                  <div className="text-[13.5px] font-bold text-text-strong">{f.ref}</div>
                  <div className="text-[12.5px] text-muted mt-0.5">{f.customer}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Pill variant={filePillVariant(f)}>{f.allReady ? 'Tamam' : 'Eksik'}</Pill>
                    <span className="text-[12px] text-muted-2">{f.meta}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Detail panel */}
          {selectedFile && (
            <Card>
              <CardHead
                title={`${selectedFile.ref} · ${selectedFile.customer}`}
                sub="Karayolu · Standart ihracat · Evrak hazırlık kontrolü"
                actions={
                  <Button
                    variant="blue"
                    icon={Bell}
                    onClick={() => toast('Eksik evrak hatırlatması gönderildi')}
                  >
                    Evrak Hatırlatma Gönder
                  </Button>
                }
              />
              <CardBody>
                <DecisionBox allReady={selectedFile.allReady} />

                {/* Tab bar */}
                <div className="flex border-b border-line mb-4">
                  <TabButton tabKey="docs"      label="Evrak Durumu"                  active={activeTab === 'docs'}      onClick={() => setActiveTab('docs')} />
                  <TabButton tabKey="conflicts" label="Eksik Evrak & Uyumsuzluklar"   active={activeTab === 'conflicts'} onClick={() => setActiveTab('conflicts')} />
                </div>

                {activeTab === 'docs' && (
                  <DocStatusTab docs={docs} onPreview={handlePreview} />
                )}
                {activeTab === 'conflicts' && (
                  <ConflictsTab conflicts={conflicts} />
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Preview drawer */}
      <PreviewDrawer
        open={previewOpen}
        data={previewData}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
