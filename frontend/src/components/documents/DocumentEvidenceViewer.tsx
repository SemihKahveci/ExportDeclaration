import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileSearch, Loader2, X } from 'lucide-react';
import Button from '../ui/Button';
import { apiGetBlob, apiGetJson } from '../../api/apiClient';

export interface EvidenceBBox { x0: number; y0: number; x1: number; y1: number; }
export interface DocumentEvidenceSelection {
  pageNumber: number;
  bbox?: EvidenceBBox;
  text?: string;
  contentSource?: 'NATIVE_TEXT' | 'OCR' | 'DERIVED' | 'PAGE_IMAGE';
  label?: string;
  field?: string;
}
interface PersistedPageEvidence {
  candidateId?: string; field: string; value?: unknown; extractor?: string; confidence?: number;
  pageNumber: number; bbox: EvidenceBBox; text?: string; contentSource?: 'NATIVE_TEXT' | 'OCR' | 'PAGE_IMAGE';
}
interface PageEvidenceResponse {
  processingRunId: string; uploadedFileId: string; pageNumber: number; pageCount?: number; evidence: PersistedPageEvidence[];
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
function sourceLabel(source?: string) {
  if (source === 'OCR') return 'OCR';
  if (source === 'NATIVE_TEXT') return 'PDF metni';
  if (source === 'PAGE_IMAGE') return 'Sayfa görseli';
  if (source === 'DERIVED') return 'Türetilmiş';
  return source;
}
function padBox(box: EvidenceBBox, xPad = 0.012, yPad = 0.006): EvidenceBBox {
  return {
    x0: Math.max(0, box.x0 - xPad),
    y0: Math.max(0, box.y0 - yPad),
    x1: Math.min(1, box.x1 + xPad),
    y1: Math.min(1, box.y1 + yPad),
  };
}
/** A goods row whose own cell has no box still gets a band from the tokens on that same row. */
function rowBand(boxes: EvidenceBBox[]): EvidenceBBox {
  const y0 = Math.min(...boxes.map((box) => box.y0));
  const y1 = Math.max(...boxes.map((box) => box.y1));
  const padY = Math.max(0.008, (y1 - y0) * 0.8);
  return { x0: 0.03, y0: Math.max(0, y0 - padY), x1: 0.97, y1: Math.min(1, y1 + padY) };
}
function highlightFor(evidence: DocumentEvidenceSelection, pageEvidence: PersistedPageEvidence[] | undefined): { box?: EvidenceBBox; band: boolean } {
  if (evidence.bbox) return { box: padBox(evidence.bbox), band: false };
  const row = evidence.field?.match(/^(goodsLines\.\d+)\./)?.[1];
  const siblings = row ? (pageEvidence ?? []).filter((item) => item.field.startsWith(`${row}.`)) : [];
  if (siblings.length) return { box: rowBand(siblings.map((item) => item.bbox)), band: true };
  return { band: false };
}
function sameBox(a?:EvidenceBBox,b?:EvidenceBBox){
  if(!a||!b)return false;
  const e=0.000001;
  return Math.abs(a.x0-b.x0)<e&&Math.abs(a.y0-b.y0)<e&&Math.abs(a.x1-b.x1)<e&&Math.abs(a.y1-b.y1)<e;
}
function PageImage({imageUrl, alt, boxes, selected, caption = 'Seçili alan'}:{imageUrl:string;alt:string;boxes?:PersistedPageEvidence[];selected?:EvidenceBBox;caption?:string}) {
  return <div className="relative mx-auto w-fit max-w-full shadow-lg bg-white">
    <img src={imageUrl} alt={alt} className="block max-w-full h-auto" draggable={false} onLoad={(event)=>event.currentTarget.parentElement?.querySelector('[data-selected-box="true"]')?.scrollIntoView({block:'center',inline:'nearest'})}/>
    {boxes?.map((item,index)=>{
      const isSelected=sameBox(item.bbox,selected);
      return <div key={`${item.candidateId??item.field}-${index}`}
        title={`${item.field}${item.text?`: ${item.text}`:''}`}
        className={`absolute pointer-events-none ${isSelected?'border-[3px] border-amber-500 bg-amber-400/25 z-20':'border-2 border-emerald-500/80 bg-emerald-300/10 z-10'}`}
        style={boxStyle(item.bbox)}>
        {isSelected&&<span className="absolute -top-6 left-0 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap">{caption}</span>}
      </div>;
    })}
    {selected && !boxes?.some(x=>sameBox(x.bbox,selected)) &&
      <div data-selected-box="true" className="absolute border-[3px] border-amber-500 bg-amber-400/25 pointer-events-none z-20" style={boxStyle(selected)}>
        <span className="absolute -top-6 left-0 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap">{caption}</span>
      </div>}
  </div>;
}

export default function DocumentEvidenceViewer({ open, declarationId, uploadedFileId, evidence, onClose, mode = 'selected' }: Props) {
  const [page,setPage]=useState(evidence?.pageNumber ?? 1);
  const [imageUrl,setImageUrl]=useState<string|null>(null);
  const [pdfUrl,setPdfUrl]=useState<string|null>(null);
  const [pageEvidence,setPageEvidence]=useState<PageEvidenceResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const originalScrollRef=useRef<HTMLDivElement|null>(null);
  const parsedScrollRef=useRef<HTMLDivElement|null>(null);
  const syncingScrollRef=useRef(false);

  const syncScroll=(source:HTMLDivElement,target:HTMLDivElement|null)=>{
    if(!target||syncingScrollRef.current)return;
    syncingScrollRef.current=true;
    const maxSourceY=Math.max(1,source.scrollHeight-source.clientHeight);
    const maxTargetY=Math.max(0,target.scrollHeight-target.clientHeight);
    const maxSourceX=Math.max(1,source.scrollWidth-source.clientWidth);
    const maxTargetX=Math.max(0,target.scrollWidth-target.clientWidth);
    target.scrollTop=(source.scrollTop/maxSourceY)*maxTargetY;
    target.scrollLeft=(source.scrollLeft/maxSourceX)*maxTargetX;
    requestAnimationFrame(()=>{syncingScrollRef.current=false;});
  };

  useEffect(()=>{ if(open && evidence) setPage(evidence.pageNumber); },[open,evidence?.pageNumber]);
  useEffect(()=>{
    if(!open||!evidence)return;
    let disposed=false,imageObjectUrl:string|null=null,pdfObjectUrl:string|null=null;
    setLoading(true);setError(null);setPageEvidence(null);
    const base=`/api/declarations/${encodeURIComponent(declarationId)}/documents/${encodeURIComponent(uploadedFileId)}`;
    Promise.all([
      apiGetBlob(`${base}/pages/${page}/image`),
      apiGetBlob(`${base}/content`),
      apiGetJson<PageEvidenceResponse>(`${base}/pages/${page}/evidence`),
    ]).then(([image,pdf,allEvidence])=>{
      if(disposed)return;
      imageObjectUrl=URL.createObjectURL(image);pdfObjectUrl=URL.createObjectURL(pdf);
      setImageUrl(imageObjectUrl);setPdfUrl(pdfObjectUrl);setPageEvidence(allEvidence);
    }).catch(()=>{if(!disposed)setError('Belge analizi yüklenemedi.');})
      .finally(()=>{if(!disposed)setLoading(false);});
    return()=>{disposed=true;if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);if(pdfObjectUrl)URL.revokeObjectURL(pdfObjectUrl);};
  },[open,declarationId,uploadedFileId,page,mode]);

  const highlight=useMemo(()=>evidence && evidence.pageNumber===page ? highlightFor(evidence,pageEvidence?.evidence) : {band:false},[evidence,page,pageEvidence]);
  useEffect(()=>{
    if(!imageUrl||!highlight.box)return;
    parsedScrollRef.current?.querySelector('[data-selected-box="true"]')?.scrollIntoView({block:'center',inline:'nearest'});
  },[imageUrl,highlight.box]);

  const counts=useMemo(()=>{
    const rows=pageEvidence?.evidence??[];
    return {total:rows.length,ocr:rows.filter(x=>x.contentSource==='OCR').length,native:rows.filter(x=>x.contentSource==='NATIVE_TEXT').length};
  },[pageEvidence]);

  if(!open||!evidence)return null;
  return <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onMouseDown={onClose}>
    <div className="bg-surface border border-line rounded-xl shadow-2xl w-[min(1580px,97vw)] h-[min(900px,94vh)] flex flex-col overflow-hidden" onMouseDown={e=>e.stopPropagation()}>
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <FileSearch size={18}/>
        <div><div className="font-bold text-[14px]">{evidence.label??'Belge Analizi'}</div><div className="text-[11.5px] text-muted">Sayfa {page}{sourceLabel(evidence.contentSource)?` · ${sourceLabel(evidence.contentSource)}`:''}{highlight.band?' · satır bandı':''}</div></div>
        {mode==='all' && (pageEvidence?.pageCount ?? 0) > 1 && (
          <div className="flex items-center gap-1">
            {Array.from({ length: pageEvidence?.pageCount ?? 0 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setPage(n)} className={['px-2.5 py-1 rounded text-[12px] font-semibold', n===page ? 'bg-accent text-white' : 'bg-surface-2 text-muted'].join(' ')}>Sayfa {n}</button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {mode==='all'&&pageEvidence&&<span className="text-[11px] text-muted border border-line rounded-full px-2.5 py-1">{counts.total} tespit · {counts.ocr} OCR · {counts.native} PDF metni</span>}
          {pdfUrl&&<a href={`${pdfUrl}#page=${page}`} target="_blank" rel="noreferrer"><Button icon={ExternalLink}>PDF'yi Aç</Button></a>}
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
            <div ref={originalScrollRef} onScroll={e=>syncScroll(e.currentTarget,parsedScrollRef.current)} className="flex-1 min-h-0 overflow-auto p-4"><PageImage imageUrl={imageUrl} alt={`Orijinal belge sayfa ${evidence.pageNumber}`}/></div>
          </section>
          <section className="min-w-0 min-h-0 bg-[#e8e5df] flex flex-col">
            <div className="px-4 py-2.5 bg-surface border-b border-line flex items-center justify-between gap-2"><div><div className="font-bold text-[12.5px]">{mode==='all'?'Parse Edilen':'Seçili Alan'}</div><div className="text-[10.5px] text-muted">{highlight.band?'Tutarın kendi kutusu yok; aynı satırdaki kanıtlardan biraz geniş çizildi.':mode==='all'?'Bu fiziksel dosya ve sayfadaki persisted IDP kanıtları':'Yalnızca seçtiğiniz alanın persisted bbox kanıtı'}</div></div><div className="flex items-center gap-3 text-[10.5px] text-muted">{mode==='all'&&<span className="flex items-center gap-1"><i className="w-3 h-3 border-2 border-emerald-500 inline-block"/>Tespit</span>}<span className="flex items-center gap-1"><i className="w-3 h-3 border-[3px] border-amber-500 inline-block"/>Seçili</span></div></div>
            <div ref={parsedScrollRef} onScroll={e=>syncScroll(e.currentTarget,originalScrollRef.current)} className="flex-1 min-h-0 overflow-auto p-4"><PageImage imageUrl={imageUrl} alt={`Parse edilen belge sayfa ${evidence.pageNumber}`} boxes={mode==='all'?(pageEvidence?.evidence??[]):[]} selected={highlight.box} caption={highlight.band?'Satır':'Seçili alan'}/></div>
          </section>
        </div>:null}
      </div>
    </div>
  </div>;
}
