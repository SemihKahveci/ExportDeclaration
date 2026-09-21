import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileSearch, Loader2, X } from 'lucide-react';
import Button from '../ui/Button';
import { apiGetBlob, apiGetJson } from '../../api/apiClient';

export interface EvidenceBBox { x0: number; y0: number; x1: number; y1: number; }
export interface DocumentEvidenceSelection {
  pageNumber: number;
  bbox?: EvidenceBBox;
  text?: string;
  contentSource?: 'NATIVE_TEXT' | 'OCR' | 'DERIVED';
  label?: string;
}
interface PersistedPageEvidence {
  candidateId?: string; field: string; value?: unknown; extractor?: string; confidence?: number;
  pageNumber: number; bbox: EvidenceBBox; text?: string; contentSource?: 'NATIVE_TEXT' | 'OCR';
}
interface PageEvidenceResponse {
  processingRunId: string; uploadedFileId: string; pageNumber: number; evidence: PersistedPageEvidence[];
}
interface Props {
  open: boolean; declarationId: string; uploadedFileId: string;
  evidence: DocumentEvidenceSelection | null; onClose: () => void;
  mode?: 'selected' | 'all';
}

function boxStyle(b: EvidenceBBox) {
  const x0=Math.max(0,Math.min(1,b.x0)), y0=Math.max(0,Math.min(1,b.y0));
  const x1=Math.max(0,Math.min(1,b.x1)), y1=Math.max(0,Math.min(1,b.y1));
  return {left:`${x0*100}%`,top:`${y0*100}%`,width:`${Math.max(0,x1-x0)*100}%`,height:`${Math.max(0,y1-y0)*100}%`};
}
function sameBox(a?:EvidenceBBox,b?:EvidenceBBox){
  if(!a||!b)return false;
  const e=0.000001;
  return Math.abs(a.x0-b.x0)<e&&Math.abs(a.y0-b.y0)<e&&Math.abs(a.x1-b.x1)<e&&Math.abs(a.y1-b.y1)<e;
}
function PageImage({imageUrl, alt, boxes, selected}:{imageUrl:string;alt:string;boxes?:PersistedPageEvidence[];selected?:EvidenceBBox}) {
  return <div className="relative mx-auto w-fit max-w-full shadow-lg bg-white">
    <img src={imageUrl} alt={alt} className="block max-w-full h-auto" draggable={false}/>
    {boxes?.map((item,index)=>{
      const isSelected=sameBox(item.bbox,selected);
      return <div key={`${item.candidateId??item.field}-${index}`}
        title={`${item.field}${item.text?`: ${item.text}`:''}`}
        className={`absolute pointer-events-none ${isSelected?'border-[3px] border-amber-500 bg-amber-400/25 z-20':'border-2 border-emerald-500/80 bg-emerald-300/10 z-10'}`}
        style={boxStyle(item.bbox)}>
        {isSelected&&<span className="absolute -top-6 left-0 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap">Seçili alan</span>}
      </div>;
    })}
    {selected && !boxes?.some(x=>sameBox(x.bbox,selected)) &&
      <div className="absolute border-[3px] border-amber-500 bg-amber-400/25 pointer-events-none z-20" style={boxStyle(selected)}>
        <span className="absolute -top-6 left-0 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap">Seçili alan</span>
      </div>}
  </div>;
}

export default function DocumentEvidenceViewer({ open, declarationId, uploadedFileId, evidence, onClose, mode = 'selected' }: Props) {
  const [imageUrl,setImageUrl]=useState<string|null>(null);
  const [pdfUrl,setPdfUrl]=useState<string|null>(null);
  const [pageEvidence,setPageEvidence]=useState<PageEvidenceResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(!open||!evidence)return;
    let disposed=false,imageObjectUrl:string|null=null,pdfObjectUrl:string|null=null;
    setLoading(true);setError(null);setPageEvidence(null);
    const base=`/api/declarations/${encodeURIComponent(declarationId)}/documents/${encodeURIComponent(uploadedFileId)}`;
    Promise.all([
      apiGetBlob(`${base}/pages/${evidence.pageNumber}/image`),
      apiGetBlob(`${base}/content`),
      mode === 'all'
        ? apiGetJson<PageEvidenceResponse>(`${base}/pages/${evidence.pageNumber}/evidence`)
        : Promise.resolve<PageEvidenceResponse | null>(null),
    ]).then(([image,pdf,allEvidence])=>{
      if(disposed)return;
      imageObjectUrl=URL.createObjectURL(image);pdfObjectUrl=URL.createObjectURL(pdf);
      setImageUrl(imageObjectUrl);setPdfUrl(pdfObjectUrl);setPageEvidence(allEvidence);
    }).catch(err=>{console.error(err);if(!disposed)setError('Belge analizi yüklenemedi.');})
      .finally(()=>{if(!disposed)setLoading(false);});
    return()=>{disposed=true;if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);if(pdfObjectUrl)URL.revokeObjectURL(pdfObjectUrl);};
  },[open,declarationId,uploadedFileId,evidence?.pageNumber,mode]);

  const counts=useMemo(()=>{
    const rows=pageEvidence?.evidence??[];
    return {total:rows.length,ocr:rows.filter(x=>x.contentSource==='OCR').length,native:rows.filter(x=>x.contentSource==='NATIVE_TEXT').length};
  },[pageEvidence]);

  if(!open||!evidence)return null;
  return <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
    <div className="bg-surface border border-line rounded-xl shadow-2xl w-[min(1580px,97vw)] h-[min(900px,94vh)] flex flex-col overflow-hidden" onMouseDown={e=>e.stopPropagation()}>
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <FileSearch size={18}/>
        <div><div className="font-bold text-[14px]">{evidence.label??'Belge Analizi'}</div><div className="text-[11.5px] text-muted">Sayfa {evidence.pageNumber}{evidence.contentSource?` · ${evidence.contentSource==='OCR'?'OCR':evidence.contentSource==='NATIVE_TEXT'?'PDF metni':'Türetilmiş'}`:''}</div></div>
        <div className="ml-auto flex items-center gap-2">
          {mode==='all'&&pageEvidence&&<span className="text-[11px] text-muted border border-line rounded-full px-2.5 py-1">{counts.total} tespit · {counts.ocr} OCR · {counts.native} PDF metni</span>}
          {pdfUrl&&<a href={`${pdfUrl}#page=${evidence.pageNumber}`} target="_blank" rel="noreferrer"><Button icon={ExternalLink}>PDF'yi Aç</Button></a>}
          <button type="button" onClick={onClose} className="w-8 h-8 rounded border border-line flex items-center justify-center"><X size={16}/></button>
        </div>
      </div>
      {evidence.text&&<div className="px-4 py-2 border-b border-line bg-surface-2 text-[12.5px]"><b>Seçili kanıt:</b> “{evidence.text}”</div>}
      <div className="flex-1 min-h-0 bg-[#e8e5df]">
        {loading?<div className="h-full flex items-center justify-center gap-2 text-muted"><Loader2 className="animate-spin" size={18}/> Belge analizi hazırlanıyor…</div>
        :error?<div className="h-full flex items-center justify-center text-warn">{error}</div>
        :imageUrl?<div className="h-full grid grid-cols-2 gap-px bg-line">
          <section className="min-w-0 min-h-0 bg-[#e8e5df] flex flex-col">
            <div className="px-4 py-2.5 bg-surface border-b border-line"><div className="font-bold text-[12.5px]">Orijinal Belge</div><div className="text-[10.5px] text-muted">İşaretsiz fiziksel PDF sayfası</div></div>
            <div className="flex-1 min-h-0 overflow-auto p-4"><PageImage imageUrl={imageUrl} alt={`Orijinal belge sayfa ${evidence.pageNumber}`}/></div>
          </section>
          <section className="min-w-0 min-h-0 bg-[#e8e5df] flex flex-col">
            <div className="px-4 py-2.5 bg-surface border-b border-line flex items-center justify-between gap-2"><div><div className="font-bold text-[12.5px]">{mode==='all'?'Parse Edilen':'Seçili Alan'}</div><div className="text-[10.5px] text-muted">{mode==='all'?'Bu fiziksel dosya ve sayfadaki persisted IDP kanıtları':'Yalnızca seçtiğiniz alanın persisted bbox kanıtı'}</div></div><div className="flex items-center gap-3 text-[10.5px] text-muted">{mode==='all'&&<span className="flex items-center gap-1"><i className="w-3 h-3 border-2 border-emerald-500 inline-block"/>Tespit</span>}<span className="flex items-center gap-1"><i className="w-3 h-3 border-[3px] border-amber-500 inline-block"/>Seçili</span></div></div>
            <div className="flex-1 min-h-0 overflow-auto p-4"><PageImage imageUrl={imageUrl} alt={`Parse edilen belge sayfa ${evidence.pageNumber}`} boxes={mode==='all'?(pageEvidence?.evidence??[]):[]} selected={evidence.bbox}/></div>
          </section>
        </div>:null}
      </div>
    </div>
  </div>;
}
