import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Send, FileText, Layers, Loader2, ChevronLeft, Bell } from 'lucide-react';
import type { BeyannameListeItem, BeyannameRecord } from '../../types';
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
import { ApiError, apiErrorCode } from '../../api/apiClient';
import Note from '../../components/ui/Note';
import { GtipChoiceModal, useHoldStepConfirm } from '../../components/workflow/WorkflowDialogs';
import { listDocuments } from '../../api/documentApi';
import DocumentEvidenceViewer from '../../components/documents/DocumentEvidenceViewer';

const TAB_ITEMS = [
  { key: 'yazim',   label: 'Beyanname Yazım', icon: FileText },
  { key: 'kontrol', label: 'MT Kontrol',       icon: Layers  },
];

type ViewMode = 'list' | 'detail';

function actionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function BeyannameYazimPage() {
  const { toast } = useToast();
  const { confirmIfHeld, dialog: holdDialog } = useHoldStepConfirm();
  const [gtipOpen, setGtipOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const declarationIdParam = searchParams.get('declarationId');
  const refParam = searchParams.get('ref');
  const requestedTab = searchParams.get('tab') === 'kontrol' ? 'kontrol' : 'yazim';

  const [loading,          setLoading]          = useState(true);
  const [listeItems,       setListeItems]        = useState<BeyannameListeItem[]>([]);
  const [records,          setRecords]           = useState<BeyannameRecord[]>([]);
  const [selectedId,       setSelectedId]        = useState<string>('');

  const [viewMode,         setViewMode]          = useState<ViewMode>('list');
  const [activeTab,        setActiveTab]         = useState<'yazim' | 'kontrol'>('yazim');
  const [hasViewedPreview, setHasViewedPreview]  = useState(false);
  const [previewDocId,     setPreviewDocId]      = useState<string | null>(null);
  const [previewLabel,     setPreviewLabel]      = useState('Belge');
  const [uploadOpen,       setUploadOpen]        = useState(false);
  const [uploadRef,        setUploadRef]         = useState<string | undefined>(undefined);
  const [reminderOpen,     setReminderOpen]      = useState(false);
  const [reminderRef,      setReminderRef]       = useState<string | undefined>(undefined);

  useEffect(() => {
    Promise.all([
      beyannameListeService.getItems(),
      beyannameService.getRecords(),
    ]).then(([liste, recs]) => {
      setListeItems(liste);
      setRecords(recs);
      if (recs.length) {
        const matchById = declarationIdParam ? recs.find((r) => r.id === declarationIdParam) : null;
        const matchByRef = refParam ? recs.find((r) => r.ref === refParam) : null;
        const target = matchById ?? matchByRef;
        setSelectedId((target ?? recs[0]).id);
        if (target) {
          setActiveTab(requestedTab);
          setViewMode('detail');
        }
      }
    }).finally(() => setLoading(false));
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

  async function handleViewDeclaration() {
    if (!selected) return;
    try {
      const docs = await listDocuments(selected.id);
      const invoice = docs.find((doc) => doc.type === 'INVOICE') ?? docs[0];
      if (!invoice) {
        toast('Bu beyannamede görüntülenecek belge yok.');
        return;
      }
      setPreviewLabel(invoice.fileName ?? 'Fatura');
      setPreviewDocId(invoice._id);
      setHasViewedPreview(true);
    } catch (error) {
      console.error(error);
      toast('Belge görünümü açılamadı.');
    }
  }

  async function reloadDeclarationData() {
    const [liste,recs]=await Promise.all([beyannameListeService.getItems(),beyannameService.getRecords()]);
    setListeItems(liste); setRecords(recs);
  }

  async function handleSendToControl(options?: { gtipDecision?: 'continue' | 'ask-customer'; holdConfirmed?: boolean }) {
    if (!selected) return;
    if (selected.operationFileStatus === 'beklemede' && !options?.holdConfirmed) {
      if (!(await confirmIfHeld(true))) return;
    }
    try {
      const updated = await beyannameService.transitionWriting(selected.id,{ action:'SUBMIT_TO_MT', gtipDecision: options?.gtipDecision });
      if (updated.operation?.fileStatus === 'gtip-hazirlik') {
        await reloadDeclarationData();
        setGtipOpen(false);
        toast('GTİP müşteriden isteniyor. Dosya GTİP hazırlıkta bekliyor.');
        return;
      }
      setGtipOpen(false);
      await reloadDeclarationData();
      setActiveTab('kontrol');
      toast('Beyanname MT kontrole gönderildi');
    } catch (error) {
      console.error(error);
      if (apiErrorCode(error) === 'GTIP_MATCH_CONFIRM') {
        setGtipOpen(true);
        return;
      }
      toast(actionError(error, 'MT kontrole geçiş yapılamadı'), { duration: 7000 });
    }
  }

  async function handleReturnToWriting() {
    if (!selected) return;
    try {
      await beyannameService.transitionWriting(selected.id, { action: 'RETURN_TO_WRITING' });
      await reloadDeclarationData();
      setActiveTab('yazim');
      toast('Beyanname yazıma geri gönderildi');
    } catch (error) {
      console.error(error);
      toast(actionError(error, 'Yazıma geri gönderilemedi'), { duration: 7000 });
    }
  }

  async function handleSistemeGonder() {
    if (!selected) return;
    if (!(await confirmIfHeld(selected.operationFileStatus === 'beklemede'))) return;
    try {
      await beyannameService.transitionWriting(selected.id,{action:'APPROVE_MT'});
      await reloadDeclarationData();
      toast('MT kontrol tamamlandı; beyanname onaya gönderildi');
      navigate(`/beyanname-onay?declarationId=${encodeURIComponent(selected.id)}&ref=${encodeURIComponent(selected.ref)}`);
    } catch (error) {
      console.error(error);
      toast(actionError(error, 'Beyanname onaya gönderilemedi'), { duration: 7000 });
    }
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
            <Button icon={Bell} onClick={() => { setReminderRef(undefined); setReminderOpen(true); }} writeCap="beyanname.write">
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
          onUploaded={(declarationId) => {
            const uploadedItem = listeItems.find((item) => item.id === declarationId);
            const uploadedRef = uploadedItem?.ref ?? uploadRef ?? "";
            navigate(`/evrak-hazirlik?declarationId=${encodeURIComponent(declarationId)}&ref=${encodeURIComponent(uploadedRef)}`);
          }}
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
          <div className="flex items-center gap-4 mb-1.5">
            <button
              onClick={() => setViewMode('list')}
              className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-accent transition-colors"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
              <span>Beyanname Listesine Dön</span>
            </button>
            {selected && (
              <button
                onClick={() => navigate(`/evrak-hazirlik?declarationId=${encodeURIComponent(selected.id)}&ref=${encodeURIComponent(selected.ref)}`)}
                className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-accent transition-colors"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
                <span>Evrak Hazırlığa Dön</span>
              </button>
            )}
          </div>
          <h1 className="text-[23px] font-extrabold text-text-strong tracking-tight">
            Beyanname Yazım & Kontrol
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-6">
          <Button variant="default" icon={Save} onClick={handleTaslakKaydet} writeCap="beyanname.write">
            Taslak Kaydet
          </Button>
          {activeTab === 'kontrol' && (
            <Button variant="primary" icon={Send} onClick={() => void handleSistemeGonder()} writeCap="beyanname.send">
              Onaya Gönder
            </Button>
          )}
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
      {selected?.returnNotice && (
        <Note variant="warn">{selected.returnNotice}</Note>
      )}
      {selected && (
        <Card className="flex flex-col min-h-0 flex-1">
          <CardHead
            title={`${selected.ref} · ${selected.customer}`}
            sub={`${selected.transportMode} · ${selected.lineItems.length} kalem · ${selected.rejim}`}
            actions={
              <Pill variant={selected.operationFileStatus === 'ic-kontrol' ? 'accent' : 'warn'}>
                {selected.durumLabel}
              </Pill>
            }
          />
          <Tabs
            tabs={TAB_ITEMS}
            active={activeTab}
            onChange={(k) => {
              const next=k as 'yazim'|'kontrol';
              if(next==='kontrol' && selected.operationFileStatus!=='ic-kontrol'){
                toast('Önce beyannameyi MT kontrole gönderin');
                return;
              }
              setActiveTab(next);
            }}
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
                declarationId={selected.id}
                onSistemeGonder={handleSistemeGonder}
                onReturnToWriting={() => void handleReturnToWriting()}
              />
            )}
          </div>
        </Card>
      )}

      <DocumentEvidenceViewer
        open={previewDocId !== null}
        declarationId={selected?.id ?? ''}
        uploadedFileId={previewDocId ?? ''}
        mode="all"
        evidence={previewDocId ? { pageNumber: 1, label: previewLabel, contentSource: 'PAGE_IMAGE' } : null}
        onClose={() => setPreviewDocId(null)}
      />
      {holdDialog}
      <GtipChoiceModal
        open={gtipOpen}
        onClose={() => setGtipOpen(false)}
        onAskCustomer={() => void handleSendToControl({ gtipDecision: 'ask-customer', holdConfirmed: true })}
        onContinue={() => void handleSendToControl({ gtipDecision: 'continue', holdConfirmed: true })}
      />
    </div>
  );
}
