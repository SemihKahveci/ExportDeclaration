import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileSearch, History, Loader2, Pencil, RefreshCw, RotateCcw, Send, UserRound } from 'lucide-react';
import { getDeclarationControlProjection, type ControlProvenanceEntry, type DeclarationControlProjection } from '../../api/declarationControlApi';
import { appendCustomsSupplementDecision, listCustomsSupplementDecisions, type CustomsSupplementDecision } from '../../api/customsSupplementApi';
import DocumentEvidenceViewer, { type DocumentEvidenceSelection } from '../../components/documents/DocumentEvidenceViewer';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

interface ControlTabProps {
  declarationId: string;
  onSistemeGonder: () => void;
}

const AUTHORITY_LABEL: Record<ControlProvenanceEntry['authority'], string> = {
  NORMALIZED_DECLARATION: 'Belge / IDP',
  MASTER_DATA: 'Master Data',
  PERSISTENT_HUMAN: 'Manuel Gümrük Kararı',
};


const DECLARATION_SUPPLEMENT_FIELDS = new Set(['customs.declarationType','customs.exportType','customs.customsOffice','customs.regimeCode','customs.fileReference','customs.declarationDate']);
const LINE_SUPPLEMENT_FIELDS = new Set(['origin','brand','exemptionCode','permitCode','utsNo','usedFlag']);
function supplementPath(path: string): string | null {
  if (DECLARATION_SUPPLEMENT_FIELDS.has(path)) return path.slice('customs.'.length);
  const m = /^lines\.(\d+)\.([A-Za-z][A-Za-z0-9]*)$/.exec(path);
  return m && LINE_SUPPLEMENT_FIELDS.has(m[2]) ? path : null;
}

function AuthorityIcon({ authority }: { authority: ControlProvenanceEntry['authority'] }) {
  if (authority === 'MASTER_DATA') return <Database size={14} />;
  if (authority === 'PERSISTENT_HUMAN') return <UserRound size={14} />;
  return <FileSearch size={14} />;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function AuthorityDetail({
  entry,
  onOpenEvidence,
}: {
  entry: ControlProvenanceEntry;
  onOpenEvidence: () => void;
}) {
  if (entry.authority === 'MASTER_DATA' && entry.masterData) {
    return (
      <div className="border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center gap-2">
          <Database size={15} className="text-accent" />
          <span className="text-[12.5px] font-bold text-text-strong">Master Data Kaydı</span>
        </div>
        <div className="divide-y divide-line">
          {[
            ['Scope', entry.masterData.scope],
            ['Key', entry.masterData.key],
            ['Kayıt ID', entry.masterData.masterDataId],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-2.5 flex justify-between gap-3 text-[12px]">
              <span className="text-muted">{label}</span>
              <span className="font-mono text-right text-text-strong break-all">{value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (entry.authority === 'PERSISTENT_HUMAN' && entry.human) {
    return (
      <div className="border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center gap-2">
          <UserRound size={15} className="text-accent" />
          <span className="text-[12.5px] font-bold text-text-strong">Kalıcı Manuel Karar</span>
        </div>
        <div className="divide-y divide-line">
          {entry.human.actorEmail && <div className="px-4 py-2.5 flex justify-between gap-3 text-[12px]"><span className="text-muted">Kullanıcı</span><span className="text-right text-text-strong">{entry.human.actorEmail}</span></div>}
          {entry.human.reason && <div className="px-4 py-2.5 flex justify-between gap-3 text-[12px]"><span className="text-muted">Gerekçe</span><span className="text-right text-text-strong">{entry.human.reason}</span></div>}
          <div className="px-4 py-2.5 flex justify-between gap-3 text-[12px]"><span className="text-muted">Karar ID</span><span className="font-mono text-right text-text-strong break-all">{entry.human.decisionId}</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center gap-2">
        <FileSearch size={15} className="text-accent" />
        <span className="text-[12.5px] font-bold text-text-strong">Belge / IDP Kaynağı</span>
      </div>
      {entry.evidence ? (
        <div className="p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div><span className="text-muted">Sayfa</span><div className="font-semibold text-text-strong">{entry.evidence.pageNumber}</div></div>
            <div><span className="text-muted">Kaynak</span><div className="font-semibold text-text-strong">{entry.evidence.contentSource ?? '—'}</div></div>
          </div>
          {entry.evidence.text && <div className="text-[12px] bg-surface-2 border border-line rounded-lg p-2.5"><span className="text-muted">Kanıt: </span><span className="font-mono text-text-strong">“{entry.evidence.text}”</span></div>}
          <Button variant="primary" icon={FileSearch} size="sm" onClick={onOpenEvidence}>Belgede Göster</Button>
        </div>
      ) : (
        <div className="p-4 flex items-start gap-2 text-[12px] text-muted">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>Bu normalize alan için fiziksel belge bbox kanıtı bulunamadı. Sistem sahte belge eşlemesi üretmedi.</span>
        </div>
      )}
    </div>
  );
}

export default function ControlTab({ declarationId, onSistemeGonder }: ControlTabProps) {
  const [projection, setProjection] = useState<DeclarationControlProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [viewerMode, setViewerMode] = useState<'selected' | 'all'>('selected');
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<CustomsSupplementDecision[]>([]);
  const [clearingDecision, setClearingDecision] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [data, history] = await Promise.all([
        getDeclarationControlProjection(declarationId),
        listCustomsSupplementDecisions(declarationId),
      ]);
      setProjection(data);
      setDecisions(history);
      setActivePath((current) => current && data.entries.some((x) => x.path === current) ? current : data.entries[0]?.path ?? null);
    } catch (err) {
      console.error(err);
      setError('MT kontrol verisi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [declarationId]);

  const active = useMemo(
    () => projection?.entries.find((entry) => entry.path === activePath) ?? null,
    [projection, activePath],
  );

  const activeSupplementPath = active ? supplementPath(active.path) : null;
  const activeDecisionHistory = useMemo(
    () => activeSupplementPath ? decisions.filter((d) => d.fieldPath === activeSupplementPath).slice().reverse() : [],
    [decisions, activeSupplementPath],
  );

  const clearManualDecision = async () => {
    if (!activeSupplementPath || active?.authority !== 'PERSISTENT_HUMAN') return;
    setClearingDecision(true); setEditError(null);
    try {
      await appendCustomsSupplementDecision(declarationId, {
        fieldPath: activeSupplementPath,
        action: 'CLEAR',
        reason: 'MT Kontrol üzerinden manuel karar kaldırıldı',
      });
      await load();
    } catch (err) {
      console.error(err);
      setEditError('Manuel karar kaldırılamadı.');
    } finally {
      setClearingDecision(false);
    }
  };

  const openManualEdit = () => {
    if (!active || !activeSupplementPath) return;
    setEditValue(displayValue(active.value) === '—' ? '' : displayValue(active.value));
    setEditReason(''); setEditError(null); setEditOpen(true);
  };
  const saveManualEdit = async () => {
    if (!activeSupplementPath || !editValue.trim()) { setEditError('Yeni değer gerekli.'); return; }
    setSavingEdit(true); setEditError(null);
    try {
      await appendCustomsSupplementDecision(declarationId, { fieldPath: activeSupplementPath, action: 'SET', value: editValue.trim(), reason: editReason.trim() || undefined });
      setEditOpen(false); await load();
    } catch (err) { console.error(err); setEditError('Manuel gümrük kararı kaydedilemedi.'); }
    finally { setSavingEdit(false); }
  };

  const evidenceSelection: DocumentEvidenceSelection | null = active?.evidence ? {
    pageNumber: active.evidence.pageNumber,
    bbox: active.evidence.bbox,
    text: active.evidence.text,
    contentSource: active.evidence.contentSource,
    label: active.label,
  } : null;

  if (loading) return <div className="h-full min-h-[360px] flex items-center justify-center gap-2 text-muted"><Loader2 size={18} className="animate-spin" /> MT kontrol provenance hazırlanıyor…</div>;
  if (error || !projection) return <div className="h-full min-h-[360px] flex flex-col items-center justify-center gap-3"><AlertTriangle className="text-warn" /><p className="text-[13px] text-muted">{error ?? 'MT kontrol verisi bulunamadı.'}</p><Button icon={RefreshCw} onClick={() => void load()}>Tekrar Dene</Button></div>;

  return (
    <>
      <div className="flex gap-4 h-full min-h-[560px]">
        <div className="flex-1 min-w-0 border border-line rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-bold text-text-strong">Beyanname Alanları</p>
              <p className="text-[11.5px] text-muted mt-0.5">Efektif değer ve üretim otoritesi · {projection.entries.length} alan</p>
            </div>
            <div className="flex items-center gap-2">
              {projection.entries.some((x) => x.evidence) && (
                <Button icon={FileSearch} size="sm" onClick={() => {
                  const first = projection.entries.find((x) => x.evidence);
                  if (first) { setActivePath(first.path); setViewerMode('all'); setEvidenceOpen(true); }
                }}>Belge Parse Karşılaştır</Button>
              )}
              <Button icon={RefreshCw} size="sm" onClick={() => void load()}>Yenile</Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto divide-y divide-line">
            {projection.entries.map((entry) => {
              const selected = entry.path === activePath;
              return (
                <button key={entry.path} type="button" onClick={() => setActivePath(entry.path)}
                  className={`w-full px-4 py-3 text-left grid grid-cols-[minmax(170px,1.1fr)_minmax(130px,1fr)_170px] gap-3 items-center transition-colors ${selected ? 'bg-accent/6' : 'bg-surface hover:bg-surface-2'}`}>
                  <div className="min-w-0"><div className="text-[12.5px] font-semibold text-text-strong truncate">{entry.label}</div><div className="text-[10.5px] text-muted font-mono truncate mt-0.5">{entry.path}</div></div>
                  <div className="text-[12px] font-mono font-semibold text-text-strong truncate">{displayValue(entry.value)}</div>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-muted"><AuthorityIcon authority={entry.authority}/><span>{AUTHORITY_LABEL[entry.authority]}</span>{entry.evidence && <CheckCircle2 size={12} className="text-ok ml-auto"/>}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-[330px] shrink-0 flex flex-col gap-3">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
            {active ? (
              <>
                <div className="border border-line rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-surface-2 border-b border-line"><p className="text-[13px] font-bold text-text-strong">{active.label}</p><p className="text-[10.5px] text-muted font-mono mt-0.5 break-all">{active.path}</p></div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] text-muted uppercase font-semibold">Efektif Beyanname Değeri</div>
                    <div className="mt-1 text-[14px] font-mono font-bold text-text-strong break-words">{displayValue(active.value)}</div>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-line bg-surface-2 text-[11.5px] font-semibold"><AuthorityIcon authority={active.authority}/>{AUTHORITY_LABEL[active.authority]}</div>
                  </div>
                </div>
                <AuthorityDetail entry={active} onOpenEvidence={() => { setViewerMode('selected'); setEvidenceOpen(true); }} />
                {activeSupplementPath && (
                  <div className="border border-line rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><History size={15} className="text-accent" /><span className="text-[12.5px] font-bold text-text-strong">Karar Geçmişi</span></div>
                      <span className="text-[10.5px] text-muted">{activeDecisionHistory.length} kayıt</span>
                    </div>
                    {activeDecisionHistory.length ? (
                      <div className="max-h-48 overflow-auto divide-y divide-line">
                        {activeDecisionHistory.map((decision) => (
                          <div key={decision.id} className="px-4 py-3 text-[11.5px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-bold ${decision.action === 'SET' ? 'text-text-strong' : 'text-muted'}`}>{decision.action === 'SET' ? 'Değer Atandı' : 'Manuel Karar Kaldırıldı'}</span>
                              <span className="text-[10px] text-muted">{new Date(decision.createdAt).toLocaleString('tr-TR')}</span>
                            </div>
                            {decision.value !== undefined && <div className="mt-1 font-mono text-text-strong break-all">{decision.value}</div>}
                            {decision.actorEmail && <div className="mt-1 text-muted">{decision.actorEmail}</div>}
                            {decision.reason && <div className="mt-1 text-muted">Gerekçe: {decision.reason}</div>}
                          </div>
                        ))}
                      </div>
                    ) : <div className="px-4 py-3 text-[11.5px] text-muted">Bu alan için henüz manuel gümrük kararı yok.</div>}
                  </div>
                )}
              </>
            ) : <div className="border border-dashed border-line-strong rounded-xl p-8 text-center text-[12px] text-muted">Kontrol edilecek bir alan seçin.</div>}
          </div>

          <Card className="shrink-0">
            <CardHead title="Kontrol Kararı" />
            <CardBody>
              <div className="flex items-center gap-2 justify-end">
                {active?.authority === 'PERSISTENT_HUMAN' && activeSupplementPath && (
                  <Button icon={clearingDecision ? Loader2 : RotateCcw} size="sm" onClick={() => void clearManualDecision()} disabled={clearingDecision}>Manuel Kararı Kaldır</Button>
                )}
                <Button variant="warn" icon={Pencil} size="sm" onClick={openManualEdit} disabled={!activeSupplementPath} title={!activeSupplementPath ? 'Bu alan customs supplement ile değiştirilemez; belge/IDP gerçeği ayrı korunur.' : undefined}>Manuel Düzelt</Button>
                <Button variant="primary" icon={Send} size="sm" onClick={onSistemeGonder}>Kontrolü Onayla</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => !savingEdit && setEditOpen(false)} title="Manuel Gümrük Kararı" footer={<>
        <Button onClick={() => setEditOpen(false)} disabled={savingEdit}>Vazgeç</Button>
        <Button variant="primary" icon={savingEdit ? Loader2 : CheckCircle2} onClick={() => void saveManualEdit()} disabled={savingEdit || !editValue.trim()}>Kararı Kaydet</Button>
      </>}>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface-2 p-3 text-[12px]">
            <div className="font-semibold text-text-strong">{active?.label}</div>
            <div className="font-mono text-[10.5px] text-muted mt-1">{activeSupplementPath}</div>
            <div className="mt-2"><span className="text-muted">Mevcut efektif değer: </span><span className="font-mono font-semibold">{active ? displayValue(active.value) : '—'}</span></div>
            <div className="mt-1"><span className="text-muted">Mevcut otorite: </span><span className="font-semibold">{active ? AUTHORITY_LABEL[active.authority] : '—'}</span></div>
          </div>
          <label className="flex flex-col gap-1.5 text-[12px]"><span className="font-semibold text-text-strong">Yeni değer</span><input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} className="h-9 rounded border border-line bg-surface px-3 text-[13px] font-mono outline-none focus:border-accent" /></label>
          <label className="flex flex-col gap-1.5 text-[12px]"><span className="font-semibold text-text-strong">Gerekçe <span className="font-normal text-muted">(opsiyonel)</span></span><textarea value={editReason} onChange={e => setEditReason(e.target.value)} rows={3} className="rounded border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent" placeholder="Örn. müşteri teyidi / gümrük operasyon kararı" /></label>
          <div className="text-[11.5px] text-muted">Bu işlem IDP sonucunu değiştirmez. Yeni karar append-only olarak saklanır ve efektif beyannamede <b>Manuel Gümrük Kararı</b> otoritesiyle uygulanır.</div>
          {editError && <div className="rounded border border-danger/30 bg-danger/5 p-2.5 text-[12px] text-danger">{editError}</div>}
        </div>
      </Modal>

      {active?.evidence && (
        <DocumentEvidenceViewer
          open={evidenceOpen}
          declarationId={declarationId}
          uploadedFileId={active.evidence.uploadedFileId}
          evidence={evidenceSelection}
          onClose={() => setEvidenceOpen(false)}
          mode={viewerMode}
        />
      )}
    </>
  );
}
