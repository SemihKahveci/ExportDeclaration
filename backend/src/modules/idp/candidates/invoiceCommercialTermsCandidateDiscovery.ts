import type {
  CanonicalBBox,
  CanonicalDocument,
  CanonicalLine,
  CanonicalPage,
  CanonicalWord,
} from "../domain/canonicalDocument.types.js";
import type {
  FieldCandidate,
  FieldCandidateEnvelope,
} from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-commercial-terms-generic-v2";

type EvidenceLine = {
  text: string;
  bbox: CanonicalBBox;
  source: "NATIVE_TEXT" | "OCR";
  pageNumber: number;
};

function norm(text: string): string {
  return text
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ç/g, "C").replace(/Ğ/g, "G")
    .replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U")
    .replace(/\s+/g, " ").trim();
}

function unionBox(words: CanonicalWord[]): CanonicalBBox {
  return {
    x0: Math.min(...words.map(w => w.bbox.x0)),
    y0: Math.min(...words.map(w => w.bbox.y0)),
    x1: Math.max(...words.map(w => w.bbox.x1)),
    y1: Math.max(...words.map(w => w.bbox.y1)),
  };
}

function visualLines(page: CanonicalPage): EvidenceLine[] {
  if (page.lines?.length) {
    return page.lines.filter(line => line.text.trim()).map((line: CanonicalLine) => ({
      text: line.text.trim(), bbox: line.bbox, source: line.source, pageNumber: page.pageNumber,
    }));
  }
  const words = page.words.slice().sort((a,b) =>
    ((a.bbox.y0+a.bbox.y1)/2)-((b.bbox.y0+b.bbox.y1)/2) || a.bbox.x0-b.bbox.x0
  );
  const groups: CanonicalWord[][] = [];
  for (const word of words) {
    const cy=(word.bbox.y0+word.bbox.y1)/2;
    const g=groups.find(xs => {
      const f=xs[0]!, gy=(f.bbox.y0+f.bbox.y1)/2;
      return Math.abs(gy-cy)<=0.012;
    });
    if(g) g.push(word); else groups.push([word]);
  }
  return groups.map(g=>g.sort((a,b)=>a.bbox.x0-b.bbox.x0)).map(g=>({
    text:g.map(w=>w.text).join(" ").trim(),
    bbox:unionBox(g),
    source:g.some(w=>w.source==="OCR")?"OCR":"NATIVE_TEXT",
    pageNumber:page.pageNumber,
  }));
}

function candidate(field:string,value:unknown,id:string,segmentId:string,line:EvidenceLine,confidence:number):FieldCandidate {
  return {
    candidateId:id, field, value, confidence, extractor:EXTRACTOR,
    evidence:[{segmentId,pageNumber:line.pageNumber,bbox:line.bbox,text:line.text,contentSource:line.source}],
  };
}
function add(fields:Record<string,FieldCandidate[]>, c:FieldCandidate|undefined){ if(c)(fields[c.field]??=[]).push(c); }
function cy(l:EvidenceLine){return (l.bbox.y0+l.bbox.y1)/2}
function cx(l:EvidenceLine){return (l.bbox.x0+l.bbox.x1)/2}
function sameRow(a:EvidenceLine,b:EvidenceLine){
  const ah=Math.max(.006,a.bbox.y1-a.bbox.y0), bh=Math.max(.006,b.bbox.y1-b.bbox.y0);
  return Math.abs(cy(a)-cy(b))<=Math.max(ah,bh)*.9;
}
function findLabel(lines:EvidenceLine[], re:RegExp){return lines.find(l=>re.test(norm(l.text)))}

const INCOTERMS = new Set(["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"]);
function deliveryTerm(lines:EvidenceLine[]) {
  const label=findLabel(lines,/\bTESLIM\s*SARTI\b/);
  const values=lines.flatMap(line =>
    line.text.split(/\s+/).map(t=>t.replace(/[^A-Za-z]/g,"").toUpperCase())
      .filter(t=>INCOTERMS.has(t)).map(value=>({value,line}))
  );
  if(!values.length) return undefined;
  if(label){
    const row=values.filter(v=>sameRow(v.line,label))
      .sort((a,b)=>Math.abs(cx(a.line)-cx(label))-Math.abs(cx(b.line)-cx(label)));
    if(row.length) return row[0];
  }
  const distinct=[...new Set(values.map(v=>v.value))];
  return distinct.length===1 ? values[0] : undefined;
}

const MODES: Array<[RegExp,string]> = [
  [/\bKARA\s*YOLU\b|\bKARAYOLU\b/,"Karayolu"],
  [/\bHAVA\s*YOLU\b|\bHAVAYOLU\b/,"Havayolu"],
  [/\bDENIZ\s*YOLU\b|\bDENIZYOLU\b/,"Denizyolu"],
  [/\bDEMIR\s*YOLU\b|\bDEMIRYOLU\b/,"Demiryolu"],
];
function transportMode(lines:EvidenceLine[]) {
  const hits: Array<{value:string;line:EvidenceLine}>=[];
  for(const line of lines) for(const [re,value] of MODES) if(re.test(norm(line.text))) hits.push({value,line});
  const distinct=[...new Set(hits.map(h=>h.value))];
  return distinct.length===1 ? hits[0] : undefined;
}

const CURRENCIES = new Set(["TRY","TL","EUR","USD","GBP","CHF","JPY","CNY","RUB","AED","SAR"]);

function currencyToken(text:string):string|undefined {
  for(const raw of text.split(/\s+/)){
    let t=raw.replace(/[^A-Za-z₺€$£]/g,"").toUpperCase();
    if(t==="€")t="EUR"; else if(t==="$")t="USD"; else if(t==="£")t="GBP"; else if(t==="₺")t="TRY";
    if(CURRENCIES.has(t)) return t==="TL" ? "TRY" : t;
  }
  return undefined;
}

function parseMoney(raw:string):number|undefined{
  let s=raw.trim().replace(/[^\d.,-]/g,"");
  if(!s||!/\d/.test(s)) return undefined;
  const lastComma=s.lastIndexOf(","), lastDot=s.lastIndexOf(".");
  if(lastComma>=0&&lastDot>=0){
    s=lastComma>lastDot ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
  } else if(lastComma>=0) {
    const decimals=s.length-lastComma-1;
    s=decimals===2 ? s.replace(/\./g,"").replace(",",".") : s.replace(/,/g,"");
  } else if(lastDot>=0) {
    const decimals=s.length-lastDot-1;
    if(decimals!==2) s=s.replace(/\./g,"");
  }
  const n=Number(s); return Number.isFinite(n)&&n>=0?n:undefined;
}
function totalAmount(lines:EvidenceLine[]) {
  const labels=lines.filter(l=>/\b(ODENECEK\s*TUTAR|GENEL\s*TOPLAM|MAL\s*HIZMET\s*TOPLAM\s*TUTARI|TOPLAM\s*TUTAR)\b/.test(norm(l.text)));
  for(const label of labels){
    const same=lines.filter(l=>l.pageNumber===label.pageNumber && sameRow(l,label) && l.bbox.x0>=label.bbox.x0-.02);
    const nums=same.flatMap(l=>Array.from(l.text.matchAll(/-?\d[\d.,]*\d|\d/g)).map(m=>({n:parseMoney(m[0]),line:l})))
      .filter((x):x is {n:number;line:EvidenceLine}=>x.n!==undefined);
    if(nums.length) return nums.sort((a,b)=>b.n-a.n)[0];
  }
  return undefined;
}

export function discoverInvoiceCommercialTermsFieldCandidates(
  canonical:CanonicalDocument, segmentId:string
):FieldCandidateEnvelope {
  const fields:Record<string,FieldCandidate[]>={};
  const lines=canonical.pages.flatMap(visualLines);

  const d=deliveryTerm(lines);
  if(d)add(fields,candidate("trade.deliveryTerm",d.value,"trade-delivery-term",segmentId,d.line,.98));
  const t=transportMode(lines);
  if(t)add(fields,candidate("transport.mode",t.value,"transport-mode",segmentId,t.line,.98));
  const total=totalAmount(lines);
  if(total){
    add(fields,candidate("header.totalAmount",total.n,"header-total-amount",segmentId,total.line,.98));

    /*
     * Invoice currency is deliberately bound to the selected invoice-total
     * evidence. A document may also contain exchange-rate rows such as
     * "53,3268 TRY"; those are not the invoice currency.
     */
    const totalCurrency=currencyToken(total.line.text);
    if(totalCurrency){
      add(fields,candidate("header.currency",totalCurrency,"header-currency-from-total",segmentId,total.line,.99));
    }
  }

  return {version:"1",fields};
}
