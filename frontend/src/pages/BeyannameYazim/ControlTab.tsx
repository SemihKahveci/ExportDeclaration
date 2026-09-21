import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileSearch, Loader2, Pencil, RefreshCw, Send, UserRound } from 'lucide-react';
import { getDeclarationControlProjection, type ControlProvenanceEntry, type DeclarationControlProjection } from '../../api/declarationControlApi';
import DocumentEvidenceViewer, { type DocumentEvidenceSelection } from '../../components/documents/DocumentEvidenceViewer';
import { Card, CardBody, CardHead } from '../../components/ui/Card';
import Button from '../../components/ui/Button';

interface ControlTabProps {
  declarationId: string;
  onSistemeGonder: () => void;
}

const AUTHORITY_LABEL: Record<ControlProvenanceEntry['authority'], string> = {
  NORMALIZED_DECLARATION: 'Belge / IDP',
  MASTER_DATA: 'Master Data',
  PERSISTENT_HUMAN: 'Manuel Gümrük Kararı',
};

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

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await getDeclarationControlProjection(declarationId);
      setProjection(data);
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
              </>
            ) : <div className="border border-dashed border-line-strong rounded-xl p-8 text-center text-[12px] text-muted">Kontrol edilecek bir alan seçin.</div>}
          </div>

          <Card className="shrink-0">
            <CardHead title="Kontrol Kararı" />
            <CardBody>
              <div className="flex items-center gap-2 justify-end">
                <Button variant="warn" icon={Pencil} size="sm">Manuel Düzelt</Button>
                <Button variant="primary" icon={Send} size="sm" onClick={onSistemeGonder}>Kontrolü Onayla</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

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
