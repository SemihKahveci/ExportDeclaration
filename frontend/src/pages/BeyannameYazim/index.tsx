import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Send, FileText, Layers, Loader2, ChevronLeft, Bell, Download, RotateCcw } from 'lucide-react';
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
import { useHoldStepConfirm } from '../../components/workflow/WorkflowDialogs';
import { listDocuments, reprocessDocument } from '../../api/documentApi';
import DocumentEvidenceViewer from '../../components/documents/DocumentEvidenceViewer';
import { downloadDeclarationExcel } from '../../api/declarationApi';
import { sendGtipReminder } from '../../api/mailApi';
import DeclarationSheet, { type DeclarationSheetData } from './DeclarationSheet';
import Modal from '../../components/ui/Modal';

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

function returnStageLabel(record: BeyannameRecord): string {
  const returned = [...record.approvalHistory].reverse().find((entry) => entry.action === 'RETURN_TO_MT');
  if (record.approvalStatus === 'RETURNED' && returned && (returned.note ?? '') === record.returnNotice) {
    return returned.fromStatus === 'SECOND_PENDING' ? '2. Onay' : '1. Onay';
  }
  return 'MT Kontrol';
}

export default function BeyannameYazimPage() {
  const { toast } = useToast();
  const { confirmIfHeld, dialog: holdDialog } = useHoldStepConfirm();
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
  const [rewriting, setRewriting] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnNote, setReturnNote] = useState('');
  const [returning, setReturning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const sawRewritePending = useRef(false);
  const saveDraftRef = useRef<(() => Promise<void>) | null>(null);
  const sheetRef = useRef<DeclarationSheetData | null>(null);

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
        if (target?.parsing) {
          toast('Parse henüz bitmedi. Beyanname yazımı işlem tamamlanınca açılır.');
        } else if (target) {
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
    if (item.parsing) {
      toast('Parse henüz bitmedi. Beyanname yazımı işlem tamamlanınca açılır.');
      return;
    }
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
    } catch {
      toast('Belge görünümü açılamadı.');
    }
  }

  async function reloadDeclarationData() {
    const [liste,recs]=await Promise.all([beyannameListeService.getItems(),beyannameService.getRecords()]);
    setListeItems(liste); setRecords(recs);
  }

  async function handleSendToControl(options?: { holdConfirmed?: boolean }) {
    if (!selected) return;
    if (selected.operationFileStatus === 'beklemede' && !options?.holdConfirmed) {
      if (!(await confirmIfHeld(true))) return;
    }
    try {
      // Sayfadaki GTİP satırları kaydedildikten sonra kontrol edilir.
      // Kayıtla tutuyorsa onay penceresi açılmaz; tutmuyorsa mevcut hata kalır.
      const updated = await beyannameService.transitionWriting(selected.id, {
        action: 'SUBMIT_TO_MT',
        gtipDecision: 'continue',
      });
      if (updated.operation?.fileStatus === 'gtip-hazirlik' || updated.operation?.fileStatus === 'gtip-eksik') {
        await reloadDeclarationData();
        toast('GTİP kaydı eksik veya hatalı. Kaydı ekleyip düzeltin; kontrole gönderilmedi.', { duration: 7000 });
        return;
      }
      await reloadDeclarationData();
      setActiveTab('kontrol');
      toast('Beyanname MT kontrole gönderildi');
    } catch (error) {
      if (apiErrorCode(error) === 'GTIP_NOT_IN_CUSTOMER_DB') {
        await reloadDeclarationData();
      }
      toast(actionError(error, 'MT kontrole geçiş yapılamadı'), { duration: 7000 });
    }
  }

  async function handleReturnToWriting() {
    if (!selected) return;
    const note = returnNote.trim();
    if (!note) return;
    setReturning(true);
    try {
      await beyannameService.transitionWriting(selected.id, { action: 'RETURN_TO_WRITING', reason: note });
      await reloadDeclarationData();
      setReturnOpen(false);
      setReturnNote('');
      setActiveTab('yazim');
      toast('Beyanname yazıma geri gönderildi');
    } catch (error) {
      toast(actionError(error, 'Yazıma geri gönderilemedi'), { duration: 7000 });
    } finally {
      setReturning(false);
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
      toast(actionError(error, 'Beyanname onaya gönderilemedi'), { duration: 7000 });
    }
  }

  async function handleTaslakKaydet() {
    if (!saveDraftRef.current) {
      toast('Kaydedilecek beyanname yazımı açık değil.');
      return;
    }
    try {
      await saveDraftRef.current();
      await reloadDeclarationData();
      toast('Taslak kaydedildi');
    } catch (error) {
      toast(actionError(error, 'Taslak kaydedilemedi'), { duration: 7000 });
    }
  }

  async function handleDownloadExcel() {
    if (!selected || downloading) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadDeclarationExcel(selected.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(actionError(error, 'Beyanname excel indirilemedi'), { duration: 7000 });
    } finally {
      setDownloading(false);
    }
  }

  async function handleRewrite() {
    if (!selected || rewriting) return;
    try {
      const docs = await listDocuments(selected.id);
      const invoice = docs.find((doc) =>
        doc.type === 'INVOICE' || doc.type === 'E_INVOICE_XML' || doc.type === 'EXPORT_INVOICE'
      ) ?? docs[0];
      if (!invoice) {
        toast('Yeniden yazılacak fatura bulunamadı.');
        return;
      }
      sawRewritePending.current = false;
      await reprocessDocument(selected.id, invoice._id);
      setRewriting(true);
      toast('Fatura yeniden parse ediliyor. Beyanname yazımı işlem bitene kadar kapalı.');
    } catch (error) {
      toast(actionError(error, 'Fatura yeniden parse edilemedi.'), { duration: 7000 });
    }
  }

  useEffect(() => {
    if (!rewriting || !selectedId) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const docs = await listDocuments(selectedId).catch(() => []);
        const invoice = docs.find((doc) =>
          doc.type === 'INVOICE' || doc.type === 'E_INVOICE_XML' || doc.type === 'EXPORT_INVOICE'
        ) ?? docs[0];
        if (!invoice || cancelled) return;
        if (invoice.extractionStatus === 'PENDING') {
          sawRewritePending.current = true;
          return;
        }
        if (!sawRewritePending.current) return;
        setRewriting(false);
        await reloadDeclarationData();
        toast(invoice.extractionStatus === 'SUCCESS'
          ? 'Parse tamamlandı. Beyanname yazımı tekrar açıldı.'
          : 'Parse tamamlanamadı. Beyanname yazımı tekrar açıldı.');
      })();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rewriting, selectedId]);

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
          {selected && (
            <Button
              variant="default"
              icon={FileText}
              onClick={() => navigate(`/evrak-hazirlik?declarationId=${encodeURIComponent(selected.id)}&ref=${encodeURIComponent(selected.ref)}`)}
            >
              Evrak Hazırlık
            </Button>
          )}
          <Button variant="default" icon={Download} onClick={() => void handleDownloadExcel()} disabled={downloading}>
            Beyanname İndir
          </Button>
          {activeTab === 'yazim' && (
            <Button variant="default" icon={Save} onClick={() => void handleTaslakKaydet()} writeCap="beyanname.write">
              Taslak Kaydet
            </Button>
          )}
          {activeTab === 'kontrol' && (
            <Button icon={RotateCcw} onClick={() => { setReturnNote(''); setReturnOpen(true); }} writeCap="beyanname.write">
              Yazıma Geri Gönder
            </Button>
          )}
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
        <div className="mb-3 shrink-0">
          <Note variant="warn">
            <div className="font-bold text-text-strong">Beyanname Onay Geri Bildirim</div>
            <div className="text-[12px] font-semibold mt-0.5">{returnStageLabel(selected)}</div>
            <div className="mt-1">{selected.returnNotice}</div>
          </Note>
        </div>
      )}
      {selected && (
        <Card className="flex flex-col min-h-0 flex-1">
          <CardHead
            title={`${selected.ref} · ${selected.customer}`}
            sub={`${selected.transportMode} · ${selected.lineItems.length} kalem · ${selected.rejim}`}
            actions={
              <div className="flex items-center gap-2">
                {selected.operationFileStatus === 'gtip-eksik' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      void sendGtipReminder(selected.id).then((result) => {
                        toast(result.to.length > 0 ? `GTİP hatırlatması ${result.to.length} adrese gönderildi` : 'Alıcı bulunamadı');
                      }).catch((error: unknown) => {
                        toast(error instanceof ApiError ? error.message : 'GTİP hatırlatması gönderilemedi', { duration: 7000 });
                      });
                    }}
                    writeCap="beyanname.write"
                  >
                    Müşteriye hatırlat
                  </Button>
                )}
                <Pill variant={selected.operationFileStatus === 'ic-kontrol' ? 'accent' : 'warn'}>
                  {selected.durumLabel}
                </Pill>
              </div>
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
            {(rewriting || selected.parsing) && (
              <Note variant="warn">Parse devam ediyor. Beyanname yazımı işlem bitene kadar kapalı.</Note>
            )}
            {activeTab === 'yazim' ? (
              <div className={rewriting || selected.parsing ? 'pointer-events-none opacity-60' : undefined}>
                <WritingTab
                  record={selected}
                  hasViewedPreview={hasViewedPreview}
                  locked={Boolean(rewriting || selected.parsing)}
                  saveDraftRef={saveDraftRef}
                  sheetRef={sheetRef}
                  onViewDeclaration={handleViewDeclaration}
                  onSendToControl={handleSendToControl}
                  onRewrite={() => void handleRewrite()}
                />
              </div>
            ) : (
              <ControlTab declarationId={selected.id} />
            )}
          </div>
        </Card>
      )}

      <DocumentEvidenceViewer
        open={previewDocId !== null}
        declarationId={selected?.id ?? ''}
        uploadedFileId={previewDocId ?? ''}
        mode="all"
        declarationView={sheetRef.current ? <DeclarationSheet data={sheetRef.current} /> : null}
        evidence={previewDocId ? { pageNumber: 1, label: 'Ön kontrol', contentSource: 'PAGE_IMAGE' } : null}
        onClose={() => setPreviewDocId(null)}
      />
      <Modal
        open={returnOpen}
        onClose={() => !returning && setReturnOpen(false)}
        title="Yazıma geri gönder"
        footer={
          <>
            <Button onClick={() => setReturnOpen(false)} disabled={returning}>Vazgeç</Button>
            <Button variant="primary" disabled={returning || !returnNote.trim()} onClick={() => void handleReturnToWriting()}>
              {returning ? 'Gönderiliyor…' : 'Yazıma Geri Gönder'}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 text-[12.5px]">
          <span className="font-semibold text-text-strong">Not</span>
          <textarea
            value={returnNote}
            onChange={(event) => setReturnNote(event.target.value)}
            rows={4}
            className="rounded border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            placeholder="Yazıma neden geri gönderildiğini yazın"
          />
        </label>
      </Modal>
      {holdDialog}
    </div>
  );
}
