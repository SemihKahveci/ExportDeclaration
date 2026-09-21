import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCheck, CheckCircle2, Database, FileSearch, Loader2,
  MessageSquare, RefreshCw, RotateCcw, Send, UserRound,
} from 'lucide-react';
import { Card, CardHead, CardBody } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { Field, Textarea } from '../../components/ui/Fields';
import { getDeclarationControlProjection, type ControlProvenanceEntry } from '../../api/declarationControlApi';
import DocumentEvidenceViewer from '../../components/documents/DocumentEvidenceViewer';

function authorityLabel(entry: ControlProvenanceEntry) {
  if (entry.authority === 'NORMALIZED_DECLARATION') return 'Belge / IDP';
  if (entry.authority === 'MASTER_DATA') return 'Master Data';
  return 'Manuel Gümrük Kararı';
}
function AuthorityIcon({ entry }: { entry: ControlProvenanceEntry }) {
  if (entry.authority === 'MASTER_DATA') return <Database size={14} className="text-accent" />;
  if (entry.authority === 'PERSISTENT_HUMAN') return <UserRound size={14} className="text-warn" />;
  return <FileSearch size={14} className="text-ok" />;
}
function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function ApprovalStepBadge({ approvalStep, requiresSecondApproval }: { approvalStep:'first'|'second'; requiresSecondApproval:boolean }) {
  if (approvalStep === 'second') return <span className="inline-flex text-[11.5px] font-semibold px-2.5 py-1 rounded-full border text-warn bg-warn-tint border-warn/30">2. Onay Bekliyor</span>;
  return <div className="flex items-center gap-2 flex-wrap">
    <span className="inline-flex text-[11.5px] font-semibold px-2.5 py-1 rounded-full border text-accent bg-accent/8 border-accent/25">1. Onay Bekliyor</span>
    <span className={`inline-flex text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${requiresSecondApproval?'text-muted bg-surface-2 border-line-strong':'text-ok bg-ok/8 border-ok/20'}`}>
      {requiresSecondApproval?'2. Onay Gerekli':'2. Onay Gerekli Değil'}
    </span>
  </div>;
}

interface ApprovalTabProps {
  declarationId: string;
  approvalNote: string;
  requiresSecondApproval: boolean;
  approvalStep: 'first' | 'second';
  onSendToSecondApproval: () => void;
  onApproveAndSendToTescil: () => void;
  onGeriGonder: () => void;
  onNotEkle: (note: string) => void;
}

export default function ApprovalTab({
  declarationId, approvalNote, requiresSecondApproval, approvalStep,
  onSendToSecondApproval, onApproveAndSendToTescil, onGeriGonder, onNotEkle,
}: ApprovalTabProps) {
  const [entries,setEntries]=useState<ControlProvenanceEntry[]>([]);
  const [activePath,setActivePath]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [noteOpen,setNoteOpen]=useState(false);
  const [noteText,setNoteText]=useState(approvalNote);
  const [evidenceOpen,setEvidenceOpen]=useState(false);

  const load=async()=>{
    setLoading(true);setError(null);
    try{
      const data=await getDeclarationControlProjection(declarationId);
      setEntries(data.entries);
      setActivePath(current=>current&&data.entries.some(x=>x.path===current)?current:data.entries[0]?.path??null);
    }catch(err){console.error(err);setError('Beyanname kaynak/provenance bilgileri yüklenemedi.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[declarationId]);
  useEffect(()=>setNoteText(approvalNote),[approvalNote]);

  const active=entries.find(x=>x.path===activePath)??null;
  const counts=useMemo(()=>({
    document:entries.filter(x=>x.authority==='NORMALIZED_DECLARATION').length,
    master:entries.filter(x=>x.authority==='MASTER_DATA').length,
    human:entries.filter(x=>x.authority==='PERSISTENT_HUMAN').length,
  }),[entries]);
  const needsSecond=approvalStep==='first'&&requiresSecondApproval;
  const primaryLabel=needsSecond?'2. Onaya Gönder':'Onayla ve Tescile Gönder';
  const primaryIcon=needsSecond?Send:CheckCheck;
  const primaryClick=needsSecond?onSendToSecondApproval:onApproveAndSendToTescil;

  return <>
    <div className="flex gap-4 h-full min-h-[560px]">
      <div className="flex-1 min-w-0 border border-line rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center gap-3">
          <div><div className="font-bold text-[13px] text-text-strong">Efektif Beyanname Alanları</div>
          <div className="text-[11px] text-muted">{entries.length} alan · {counts.document} belge · {counts.master} master data · {counts.human} manuel</div></div>
          <Button className="ml-auto" icon={RefreshCw} size="sm" onClick={()=>void load()}>Yenile</Button>
        </div>
        {loading?<div className="flex-1 flex items-center justify-center gap-2 text-muted"><Loader2 size={18} className="animate-spin"/>Yükleniyor…</div>
        :error?<div className="flex-1 flex flex-col items-center justify-center gap-3 text-warn"><AlertTriangle size={20}/>{error}<Button onClick={()=>void load()}>Tekrar Dene</Button></div>
        :<div className="flex-1 min-h-0 overflow-auto divide-y divide-line">
          {entries.map(entry=><button key={entry.path} type="button" onClick={()=>setActivePath(entry.path)}
            className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-2 ${activePath===entry.path?'bg-accent/5':''}`}>
            <AuthorityIcon entry={entry}/>
            <div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold text-text-strong truncate">{entry.label}</div><div className="text-[10.5px] text-muted font-mono truncate">{entry.path}</div></div>
            <div className="max-w-[42%] text-right"><div className="text-[11.5px] font-mono font-semibold text-text-strong truncate">{valueText(entry.value)}</div><div className="text-[10px] text-muted">{authorityLabel(entry)}</div></div>
          </button>)}
        </div>}
      </div>

      <div className="w-[340px] shrink-0 flex flex-col gap-3">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
          {active?<>
            <div className="border border-line rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center gap-2"><AuthorityIcon entry={active}/><span className="text-[12.5px] font-bold">{authorityLabel(active)}</span></div>
              <div className="divide-y divide-line text-[12px]">
                <div className="px-4 py-3"><div className="text-muted mb-1">Alan</div><div className="font-semibold">{active.label}</div><div className="font-mono text-[10.5px] text-muted mt-1">{active.path}</div></div>
                <div className="px-4 py-3"><div className="text-muted mb-1">Efektif Değer</div><div className="font-mono font-semibold break-all">{valueText(active.value)}</div></div>
                {active.evidence&&<div className="px-4 py-3"><div className="text-muted mb-1">Belge Kanıtı</div><div>Sayfa {active.evidence.pageNumber} · {active.evidence.contentSource??'—'}</div>{active.evidence.text&&<div className="font-mono mt-1 break-all">{active.evidence.text}</div>}</div>}
                {active.masterData&&<div className="px-4 py-3"><div className="text-muted mb-1">Master Data Kuralı</div><div>{active.masterData.scope} · {active.masterData.key}</div><div className="font-mono text-[10.5px] text-muted mt-1">{active.masterData.masterDataId}</div></div>}
                {active.human&&<div className="px-4 py-3"><div className="text-muted mb-1">Manuel Karar</div>{active.human.actorEmail&&<div>{active.human.actorEmail}</div>}{active.human.reason&&<div className="mt-1">Gerekçe: {active.human.reason}</div>}{active.human.createdAt&&<div className="text-[10.5px] text-muted mt-1">{new Date(active.human.createdAt).toLocaleString('tr-TR')}</div>}</div>}
              </div>
              {active.evidence?.bbox&&active.evidence.contentSource!=='DERIVED'&&<div className="p-3 border-t border-line"><Button icon={FileSearch} onClick={()=>setEvidenceOpen(true)}>Belgede Göster</Button></div>}
            </div>
          </>:<div className="border border-dashed border-line-strong rounded-xl p-8 text-center text-muted">İncelemek için bir alan seçin.</div>}
        </div>

        <Card className="shrink-0"><CardHead title="Onay Kararı"/><CardBody><div className="flex flex-col gap-3">
          <ApprovalStepBadge approvalStep={approvalStep} requiresSecondApproval={requiresSecondApproval}/>
          <div className="flex gap-2"><Button icon={RotateCcw} onClick={onGeriGonder}>MT Kontrole Geri Gönder</Button><Button icon={MessageSquare} onClick={()=>setNoteOpen(true)}>Not</Button></div>
          <Button variant="primary" icon={primaryIcon} onClick={primaryClick}>{primaryLabel}</Button>
        </div></CardBody></Card>
      </div>
    </div>

    <Modal open={noteOpen} title="Onay Notu" onClose={()=>setNoteOpen(false)}>
      <div className="flex flex-col gap-4"><Field label="Not"><Textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={5}/></Field>
      <div className="flex justify-end"><Button variant="primary" icon={CheckCircle2} onClick={()=>{onNotEkle(noteText);setNoteOpen(false);}}>Notu Kaydet</Button></div></div>
    </Modal>

    {active?.evidence&&<DocumentEvidenceViewer open={evidenceOpen} declarationId={declarationId}
      uploadedFileId={active.evidence.uploadedFileId}
      evidence={{pageNumber:active.evidence.pageNumber,bbox:active.evidence.bbox,text:active.evidence.text,contentSource:active.evidence.contentSource,label:active.label}}
      onClose={()=>setEvidenceOpen(false)} mode="selected"/>}
  </>;
}
