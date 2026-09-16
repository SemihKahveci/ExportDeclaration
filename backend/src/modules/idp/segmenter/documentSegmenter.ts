import type { CanonicalDocument, CanonicalPage } from "../domain/canonicalDocument.types.js";
import type {
  DocumentSegment,
  SegmentBoundaryReason,
  SegmentBoundarySignals
} from "../domain/documentSegment.types.js";

type PageFingerprint = {
  pageNumber: number;
  anchor?: string;
  documentId?: string;
  printedPageNumber?: number;
  printedPageTotal?: number;
  headerTokens: Set<string>;
};

const ANCHORS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "PACKING_LIST", patterns: [/\bpacking\s+list\b/i] },
  { name: "CERTIFICATE_OF_ORIGIN", patterns: [
    /\bcertificate\s+of\s+origin\b/i, /\borigin\s+certificate\b/i
  ]},
  { name: "EUR1", patterns: [
    /\beur[\s.\-]*1\s+(?:movement\s+)?certificate\b/i,
    /\bmovement\s+certificate\s+eur[\s.\-]*1\b/i
  ]},
  { name: "ATR", patterns: [
    /\ba\.?\s*t\.?\s*r\.?\s+(?:movement\s+)?certificate\b/i,
    /\bmovement\s+certificate\s+a\.?\s*t\.?\s*r\.?\b/i,
    /\ba\.?\s*t\.?\s*r\.?\s*(?:nr|no|number)\b/i
  ]},
  { name: "BILL_OF_LADING", patterns: [/\bbill\s+of\s+lading\b/i] },
  { name: "CMR", patterns: [/\bcmr\s+(?:international\s+)?consignment\s+note\b/i] },
  { name: "INVOICE", patterns: [
    /\bcommercial\s+invoice\b/i, /\btax\s+invoice\b/i, /\bproforma\s+invoice\b/i,
    /\be[-\s]?invoice\b/i, /\binvoice\s+(?:nr|no|number|date)\b/i,
    /\bfatura\s+(?:no|numarası|numarasi|tarihi)\b/i
  ]}
];

const STOP = new Set([
  "the","and","for","with","from","page","of","no","date","total","company",
  "ve","ile","bir","sayfa","tarih","numara","toplam"
]);

function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function pageText(page: CanonicalPage): string {
  return (page.ocrApplied ? page.ocrText : page.nativeText) || page.nativeText || page.ocrText || "";
}

function regionText(page: CanonicalPage, maxY: number): string {
  const selected = page.lines
    .filter(l => l.bbox?.y0 <= maxY)
    .sort((a,b) => a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0)
    .map(l => l.text)
    .filter(Boolean);
  return selected.length ? norm(selected.join(" ")) : "";
}

function anchorSearchTexts(page: CanonicalPage): string[] {
  const full=norm(pageText(page));
  const top=regionText(page,0.38);
  // OCR canonical "lines" can actually be word-level; full text is therefore
  // authoritative for strong title phrases and footer/title repetitions.
  return [top, full.slice(0,2200), full.slice(-1800), full].filter(Boolean);
}

function detectAnchor(page: CanonicalPage): string | undefined {
  const texts=anchorSearchTexts(page);
  for (const candidate of ANCHORS) {
    if (texts.some(t => candidate.patterns.some(p => p.test(t)))) return candidate.name;
  }
  return undefined;
}

function detectDocumentId(page: CanonicalPage): string | undefined {
  const full=norm(pageText(page));
  const patterns=[
    /\b(?:commercial\s+)?invoice\s*(?:nr|no|number|#)?\s*[:#.\-]?\s*(\d{5,}[A-Z0-9./_-]*)\b/i,
    /\bfatura\s*(?:no|numarası|numarasi)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})\b/i,
    /\bpacking\s+list\s*(?:nr|no|number|#)?\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})\b/i,
    /\ba\.?\s*t\.?\s*r\.?\s*(?:nr|no|number)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})\b/i,
    /\b(?:document|certificate)\s*(?:nr|no|number|#)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})\b/i
  ];
  for(const p of patterns){
    const m=full.match(p);
    if(m?.[1]) return m[1].toUpperCase();
  }
  return undefined;
}

function detectPrintedPage(page: CanonicalPage): {current?:number;total?:number}{
  const full=norm(pageText(page));
  // Search the WHOLE page. Marel puts "Page X of Y" in the footer, which was
  // the root cause of 3.1.2 missing the 35-page invoice boundary.
  const patterns=[
    /\bpage\s*[:#-]?\s*(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})\b/ig,
    /\bsayfa\s*[:#-]?\s*(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})\b/ig
  ];
  for(const p of patterns){
    let last: RegExpExecArray | null=null, m:RegExpExecArray|null;
    while((m=p.exec(full))!==null) last=m;
    if(last) return {current:Number(last[1]),total:Number(last[2])};
  }
  const single=[...full.matchAll(/\b(?:page|sayfa)\s*[:#-]?\s*(\d{1,3})\b/ig)].pop();
  return single ? {current:Number(single[1])} : {};
}

function headerTokens(page:CanonicalPage):Set<string>{
  const source=regionText(page,0.22) || norm(pageText(page)).slice(0,900);
  return new Set(source.toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu," ").split(/\s+/)
    .filter(t=>t.length>=3 && !STOP.has(t)).slice(0,80));
}

function jaccard(a:Set<string>,b:Set<string>):number{
  if(!a.size||!b.size) return 0;
  let i=0; for(const x of a) if(b.has(x)) i++;
  return i/(a.size+b.size-i);
}

function fp(page:CanonicalPage):PageFingerprint{
  const pn=detectPrintedPage(page);
  return {
    pageNumber:page.pageNumber,
    anchor:detectAnchor(page),
    documentId:detectDocumentId(page),
    printedPageNumber:pn.current,
    printedPageTotal:pn.total,
    headerTokens:headerTokens(page)
  };
}

function decide(prev:PageFingerprint,cur:PageFingerprint):
 {reason:SegmentBoundaryReason;signals:SegmentBoundarySignals}|undefined {
  const sim=jaccard(prev.headerTokens,cur.headerTokens);
  const evidence:string[]=[];
  let score=0;

  const sequenceCompleted =
    prev.printedPageNumber!==undefined && prev.printedPageTotal!==undefined &&
    prev.printedPageTotal>1 && prev.printedPageNumber===prev.printedPageTotal;
  if(sequenceCompleted){score+=8;evidence.push("previous-page-sequence-completed");}

  const pageReset =
    cur.printedPageNumber===1 && prev.printedPageNumber!==undefined &&
    (prev.printedPageNumber>1 || prev.printedPageTotal===1);
  if(pageReset){score+=6;evidence.push("printed-page-reset");}

  const idChanged=!!cur.documentId && !!prev.documentId && cur.documentId!==prev.documentId;
  if(idChanged){score+=7;evidence.push("document-id-changed");}

  const anchorChanged=!!cur.anchor && !!prev.anchor && cur.anchor!==prev.anchor;
  if(anchorChanged){score+=6;evidence.push("document-family-changed");}

  const newAnchor=!!cur.anchor && !prev.anchor;
  if(newAnchor){score+=4;evidence.push("new-document-anchor");}

  if(sim<=0.05){score+=2;evidence.push("very-low-header-similarity");}
  else if(sim<=0.12){score+=1;evidence.push("low-header-similarity");}

  const signals:SegmentBoundarySignals={
    anchor:cur.anchor,previousAnchor:prev.anchor,
    documentId:cur.documentId,previousDocumentId:prev.documentId,
    pageNumberHint:cur.printedPageNumber,previousPageNumberHint:prev.printedPageNumber,
    pageTotalHint:cur.printedPageTotal,previousPageTotalHint:prev.printedPageTotal,
    headerSimilarity:Number(sim.toFixed(4)),boundaryScore:score,evidence
  };

  // An explicitly completed X/Y sequence is a hard logical-document boundary.
  // The following document is not required to have its own page counter.
  if(sequenceCompleted) return {reason:"PAGE_SEQUENCE_COMPLETED",signals};
  if(idChanged) return {reason:"DOCUMENT_ID_CHANGE",signals};
  if(anchorChanged) return {reason:"DOCUMENT_TYPE_CHANGE",signals};
  if(pageReset) return {reason:"PAGE_NUMBER_RESET",signals};
  if(newAnchor && sim<=0.12) return {reason:"DOCUMENT_START",signals};

  return undefined;
}

export function segmentCanonicalDocument(document:CanonicalDocument):DocumentSegment[]{
  const pages=[...document.pages].sort((a,b)=>a.pageNumber-b.pageNumber);
  if(!pages.length) return [];
  const fps=pages.map(fp);
  const starts:Array<{index:number;reason:SegmentBoundaryReason;signals:SegmentBoundarySignals}>=[{
    index:0,reason:"DOCUMENT_START",signals:{
      anchor:fps[0].anchor,documentId:fps[0].documentId,
      pageNumberHint:fps[0].printedPageNumber,pageTotalHint:fps[0].printedPageTotal,
      boundaryScore:0,evidence:["physical-document-start"]
    }
  }];
  for(let i=1;i<fps.length;i++){
    const d=decide(fps[i-1],fps[i]);
    if(d) starts.push({index:i,...d});
  }
  return starts.map((s,n)=>{
    const next=starts[n+1]?.index??pages.length;
    const nums=pages.slice(s.index,next).map(p=>p.pageNumber);
    return {
      segmentId:`segment-${String(n+1).padStart(3,"0")}`,
      startPage:nums[0],endPage:nums[nums.length-1],pageNumbers:nums,
      boundaryReason:s.reason,boundarySignals:s.signals
    };
  });
}
