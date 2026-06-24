import { useEffect, useState } from 'react';
import { Save, Send, FileText, Layers, Loader2, ChevronLeft, X, Bell } from 'lucide-react';
import type { BeyannameListeItem, BeyannameRecord, MtKontrolMapping } from '../../types';
import { beyannameService, beyannameListeService } from '../../services/declarations';
import StatCard from '../../components/ui/StatCard';
import { Card, CardHead } from '../../components/ui/Card';
import Pill from '../../components/ui/Pill';
import Button from '../../components/ui/Button';
import Tabs from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/Toast';
import WritingTab from './WritingTab';
import ControlTab from './ControlTab';
import ListeView from './ListeView';
import UploadDrawer from './UploadDrawer';
import ReminderModal from './ReminderModal';
import { PAGE_IMAGES } from './pageImages';

const TAB_ITEMS = [
  { key: 'yazim',   label: 'Beyanname Yazım', icon: FileText },
  { key: 'kontrol', label: 'MT Kontrol',       icon: Layers  },
];

type ViewMode = 'list' | 'detail';

export default function BeyannameYazimPage() {
  const { toast } = useToast();

  const [loading,          setLoading]          = useState(true);
  const [listeItems,       setListeItems]        = useState<BeyannameListeItem[]>([]);
  const [records,          setRecords]           = useState<BeyannameRecord[]>([]);
  const [selectedId,       setSelectedId]        = useState<string>('');
  const [mtMappings,       setMtMappings]        = useState<MtKontrolMapping[]>([]);

  const [viewMode,         setViewMode]          = useState<ViewMode>('list');
  const [activeTab,        setActiveTab]         = useState<'yazim' | 'kontrol'>('yazim');
  const [hasViewedPreview, setHasViewedPreview]  = useState(false);
  const [previewOpen,      setPreviewOpen]       = useState(false);
  const [previewPage,      setPreviewPage]       = useState(0);
  const [uploadOpen,       setUploadOpen]        = useState(false);
  const [uploadRef,        setUploadRef]         = useState<string | undefined>(undefined);
  const [reminderOpen,     setReminderOpen]      = useState(false);
  const [reminderRef,      setReminderRef]       = useState<string | undefined>(undefined);

  useEffect(() => {
    Promise.all([
      beyannameListeService.getItems(),
      beyannameService.getRecords(),
      beyannameService.getMtKontrolMappings(),
    ]).then(([liste, recs, mappings]) => {
      setListeItems(liste);
      setRecords(recs);
      setMtMappings(mappings);
      if (recs.length) {
        setSelectedId(recs[0].id);
      }
      setLoading(false);
    });
  }, []);

  const selected = records.find((r) => r.id === selectedId) ?? null;

  const stats = selected
    ? {
        selectedRecord: 1,
        receivedDocs:   selected.docCount,
        lateDocs:       selected.lateDocCount,
        pageCount:      2,
        warnings:       selected.warningCount,
      }
    : null;

  function openDetail(item: BeyannameListeItem, tab: 'yazim' | 'kontrol') {
    const match = records.find((r) => r.ref === item.ref) ?? records[0];
    if (match) {
      setSelectedId(match.id);
    }
    setActiveTab(tab);
    setHasViewedPreview(false);
    setViewMode('detail');
  }

  function handleViewDeclaration() {
    setPreviewPage(0);
    setPreviewOpen(true);
    setHasViewedPreview(true);
  }

  function handleSendToControl() {
    setActiveTab('kontrol');
    toast('Beyanname kontrole gönderildi');
  }

  function handleSistemeGonder() {
    toast('Beyanname sisteme gönderildi');
  }

  function handleTaslakKaydet() {
    toast('Taslak kaydedildi');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-muted">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-[13px]">Yükleniyor…</span>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <div className="px-7 pt-4 pb-6 flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
              Beyanname Yazım & Kontrol
            </h1>
            <p className="text-[12.5px] text-muted mt-1">
              Yazım ve kontrol bekleyen beyannameleri listeleyin. Satır üzerinden işleme başlayın.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button icon={Bell} onClick={() => { setReminderRef(undefined); setReminderOpen(true); }}>
              Eksik Evrak Hatırlat
            </Button>
          </div>
        </div>

        <ListeView
          items={listeItems}
          onSelectYazim={(item) => openDetail(item, 'yazim')}
          onSelectKontrol={(item) => openDetail(item, 'kontrol')}
          onRowUpload={(item) => { setUploadRef(item.ref); setUploadOpen(true); }}
          onRowReminder={(item) => { setReminderRef(item.ref); setReminderOpen(true); }}
        />

        <UploadDrawer
          open={uploadOpen}
          items={listeItems}
          preselectedRef={uploadRef}
          onClose={() => { setUploadOpen(false); setUploadRef(undefined); }}
        />

        <ReminderModal
          open={reminderOpen}
          items={listeItems}
          preselectedRef={reminderRef}
          onClose={() => { setReminderOpen(false); setReminderRef(undefined); }}
        />
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  return (
    <div className="px-7 pt-4 pb-4 flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3 shrink-0">
        <div>
          <button
            onClick={() => setViewMode('list')}
            className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-accent transition-colors mb-1.5"
          >
            <ChevronLeft size={14} strokeWidth={2.5} />
            <span>Beyanname Listesine Dön</span>
          </button>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
            Beyanname Yazım & Kontrol
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-6">
          <Button variant="default" icon={Save} onClick={handleTaslakKaydet}>
            Taslak Kaydet
          </Button>
          <Button variant="primary" icon={Send} onClick={handleSistemeGonder}>
            Sisteme Gönder
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3 mb-3 shrink-0">
        {stats ? (
          <>
            <div className="relative overflow-hidden">
              <StatCard value={stats.selectedRecord} label="Seçili Kayıt" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.receivedDocs} label="Gelen Evrak" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-ok rounded-l" />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.lateDocs} label="Sonradan Gelen" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--hat-blue)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.pageCount} label="Beyanname Sayfası" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: 'var(--muted-2)' }} />
            </div>
            <div className="relative overflow-hidden">
              <StatCard value={stats.warnings} label="Kontrol Uyarısı" />
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l" style={{ background: stats.warnings > 0 ? 'var(--warn)' : 'var(--ok)' }} />
            </div>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <StatCard key={i} value="—" label="" />)
        )}
      </div>

      {/* Main content card — fills remaining height, inner content scrolls */}
      {selected && (
        <Card className="flex flex-col min-h-0 flex-1">
          <CardHead
            title={`${selected.ref} · ${selected.customer}`}
            sub={`${selected.transportMode} · ${selected.lineItems.length} kalem · ${selected.rejim}`}
            actions={
              <Pill variant={selected.status === 'kontrol' ? 'accent' : 'warn'}>
                {selected.status === 'kontrol' ? 'Kontrol' : 'Taslak'}
              </Pill>
            }
          />
          <Tabs
            tabs={TAB_ITEMS}
            active={activeTab}
            onChange={(k) => setActiveTab(k as 'yazim' | 'kontrol')}
            className="px-5 shrink-0"
          />
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {activeTab === 'yazim' ? (
              <WritingTab
                record={selected}
                hasViewedPreview={hasViewedPreview}
                onViewDeclaration={handleViewDeclaration}
                onSendToControl={handleSendToControl}
              />
            ) : (
              <ControlTab
                mappings={mtMappings}
                onSistemeGonder={handleSistemeGonder}
              />
            )}
          </div>
        </Card>
      )}

      {/* Declaration preview modal — wide document viewer */}
      {previewOpen && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm"
            onClick={() => setPreviewOpen(false)}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-12 pointer-events-none">
            <div
              className="bg-surface rounded-xl border border-line shadow-2xl flex flex-col pointer-events-auto"
              style={{ width: 'min(1100px, calc(100vw - 96px))', height: '86vh' }}
              role="dialog"
              aria-modal="true"
              aria-label="Beyanname Görünümü"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line shrink-0">
                <h2 className="text-[15px] font-semibold text-text-strong">Beyanname Görünümü</h2>
                <div className="flex items-center gap-2">
                  {PAGE_IMAGES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPreviewPage(i)}
                      className={[
                        'px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-colors',
                        previewPage === i
                          ? 'bg-accent text-white'
                          : 'bg-surface-2 text-muted hover:bg-line hover:text-text',
                      ].join(' ')}
                    >
                      Sayfa {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className="ml-2 w-7 h-7 flex items-center justify-center rounded text-muted hover:bg-line hover:text-text transition-colors"
                    aria-label="Kapat"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto bg-[#f0ede8] px-10 py-8">
                <div className="flex justify-center">
                  <img
                    src={PAGE_IMAGES[previewPage]}
                    alt={`Beyanname Sayfa ${previewPage + 1}`}
                    style={{ width: '100%', maxWidth: '980px', height: 'auto' }}
                    className="rounded border border-line shadow-md"
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
