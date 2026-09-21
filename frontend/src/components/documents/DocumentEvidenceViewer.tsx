import { useEffect, useState } from 'react';
import { ExternalLink, FileSearch, Loader2, X } from 'lucide-react';
import Button from '../ui/Button';
import { apiGetBlob } from '../../api/apiClient';

export interface EvidenceBBox { x0: number; y0: number; x1: number; y1: number; }
export interface DocumentEvidenceSelection {
  pageNumber: number;
  bbox?: EvidenceBBox;
  text?: string;
  contentSource?: 'NATIVE_TEXT' | 'OCR' | 'DERIVED';
  label?: string;
}
interface Props {
  open: boolean; declarationId: string; uploadedFileId: string;
  evidence: DocumentEvidenceSelection | null; onClose: () => void;
}

export default function DocumentEvidenceViewer({ open, declarationId, uploadedFileId, evidence, onClose }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !evidence) return;
    let disposed = false;
    let imageObjectUrl: string | null = null;
    let pdfObjectUrl: string | null = null;
    setLoading(true); setError(null);
    Promise.all([
      apiGetBlob(`/api/declarations/${encodeURIComponent(declarationId)}/documents/${encodeURIComponent(uploadedFileId)}/pages/${evidence.pageNumber}/image`),
      apiGetBlob(`/api/declarations/${encodeURIComponent(declarationId)}/documents/${encodeURIComponent(uploadedFileId)}/content`),
    ]).then(([image, pdf]) => {
      if (disposed) return;
      imageObjectUrl = URL.createObjectURL(image);
      pdfObjectUrl = URL.createObjectURL(pdf);
      setImageUrl(imageObjectUrl); setPdfUrl(pdfObjectUrl);
    }).catch((err) => {
      console.error(err);
      if (!disposed) setError('Belge önizlemesi yüklenemedi.');
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => {
      disposed = true;
      if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    };
  }, [open, declarationId, uploadedFileId, evidence?.pageNumber]);

  if (!open || !evidence) return null;
  const b = evidence.bbox;
  const left = b ? Math.max(0, Math.min(1, b.x0)) * 100 : 0;
  const top = b ? Math.max(0, Math.min(1, b.y0)) * 100 : 0;
  const width = b ? Math.max(0, Math.min(1, b.x1) - Math.max(0, b.x0)) * 100 : 0;
  const height = b ? Math.max(0, Math.min(1, b.y1) - Math.max(0, b.y0)) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[80] bg-black/35 flex items-center justify-center p-5" onMouseDown={onClose}>
      <div className="bg-surface border border-line rounded-xl shadow-2xl w-[min(1100px,96vw)] h-[min(850px,92vh)] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center gap-3">
          <FileSearch size={18} />
          <div><div className="font-bold text-[14px]">{evidence.label ?? 'Belge Kanıtı'}</div><div className="text-[11.5px] text-muted">Sayfa {evidence.pageNumber}{evidence.contentSource ? ` · ${evidence.contentSource === 'OCR' ? 'OCR' : evidence.contentSource === 'NATIVE_TEXT' ? 'PDF metni' : 'Türetilmiş'}` : ''}</div></div>
          <div className="ml-auto flex gap-2">
            {pdfUrl && <a href={`${pdfUrl}#page=${evidence.pageNumber}`} target="_blank" rel="noreferrer"><Button icon={ExternalLink}>PDF'yi Aç</Button></a>}
            <button type="button" onClick={onClose} className="w-8 h-8 rounded border border-line flex items-center justify-center"><X size={16}/></button>
          </div>
        </div>
        {evidence.text && <div className="px-4 py-2 border-b border-line bg-surface-2 text-[12.5px]"><b>Kanıt metni:</b> “{evidence.text}”</div>}
        <div className="flex-1 min-h-0 overflow-auto bg-[#e8e5df] p-5">
          {loading ? <div className="h-full flex items-center justify-center gap-2 text-muted"><Loader2 className="animate-spin" size={18}/> Belge sayfası hazırlanıyor…</div>
          : error ? <div className="h-full flex items-center justify-center text-warn">{error}</div>
          : imageUrl ? <div className="relative mx-auto w-fit max-w-full shadow-lg bg-white">
              <img src={imageUrl} alt={`Belge sayfa ${evidence.pageNumber}`} className="block max-w-full h-auto" draggable={false}/>
              {b && <div className="absolute border-[3px] border-amber-500 bg-amber-400/20 pointer-events-none" style={{left:`${left}%`,top:`${top}%`,width:`${width}%`,height:`${height}%`}}><span className="absolute -top-6 left-0 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-1 rounded whitespace-nowrap">Kaynak alan</span></div>}
            </div> : null}
        </div>
      </div>
    </div>
  );
}
