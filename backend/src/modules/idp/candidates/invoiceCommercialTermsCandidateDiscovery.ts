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
    const parts=s.split(",");
    const grouped=parts.length===2 && parts[0]!=="0" && /^\d{1,3}$/.test(parts[0]??"") && /^\d{3}$/.test(parts[1]??"");
    s=grouped ? parts.join("") : s.replace(",",".");
  } else if(lastDot>=0) {
    const parts=s.split(".");
    const grouped=parts.length===2 && parts[0]!=="0" && /^\d{1,3}$/.test(parts[0]??"") && /^\d{3}$/.test(parts[1]??"");
    if(grouped) s=parts.join("");
  }
  const n=Number(s); return Number.isFinite(n)&&n>=0?n:undefined;
}

function paymentType(lines: EvidenceLine[]) {
  for (const line of lines) {
    const normalized = norm(line.text);
    const match = normalized.match(/\b(?:ODEME\s*KOSULU|ODEME\s*SEKLI|PAYMENT\s*(?:TERMS?|METHOD|TYPE))\s*[:#-]?\s*(.+)$/);
    if (!match?.[1]) continue;
    const value = match[1].trim();
    if (!value || /^[-+]?\d[\d.,]*\s*(?:TRY|TL|EUR|USD|GBP|CHF|JPY|CNY|RUB|AED|SAR)?$/i.test(value)) continue;
    return { value, line };
  }

  // Some invoices print the payment term itself as a standalone semantic
  // value without an adjacent "Payment Type" label. Accept only a bounded
  // vocabulary of explicit payment-term phrases; arbitrary prose and monetary
  // values remain fail-closed. This is document-generic, not supplier-specific.
  const explicitTerm = /^(?:PESIN\s+ODEME|ADVANCE(?:D)?\s+PAYMENT|PAYMENT\s+IN\s+ADVANCE|CASH\s+IN\s+ADVANCE|OPEN\s+ACCOUNT|LETTER\s+OF\s+CREDIT|DOCUMENTARY\s+CREDIT|CASH\s+AGAINST\s+DOCUMENTS)$/;
  for (const line of lines) {
    const normalized = norm(line.text).replace(/\s+/g, " ").trim();
    if (explicitTerm.test(normalized)) return { value: normalized, line };
  }
  return undefined;
}

function labelledMoney(lines: EvidenceLine[], labelRe: RegExp) {
  for (const line of lines) {
    if (!labelRe.test(norm(line.text))) continue;
    const pairs = monetaryPairs(line);
    if (pairs.length) return pairs[0];
  }
  return undefined;
}

function bankInfo(lines: EvidenceLine[]) {
  const bankish = lines.filter(line => /\b(?:BANKA|BANK|IBAN|SWIFT|BIC|ACCOUNT\s*NO|BENEFICIAL\s*BANK|BENEFICIARY)\b/.test(norm(line.text)));
  if (!bankish.length) return undefined;
  const pageCounts = new Map<number, number>();
  for (const line of bankish) pageCounts.set(line.pageNumber, (pageCounts.get(line.pageNumber) ?? 0) + 1);
  const pageNumber = [...pageCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if (!pageNumber) return undefined;
  const pageLines = lines.filter(line => line.pageNumber === pageNumber);
  const selected = pageLines.filter(line => /\b(?:BANKA|BANK|IBAN|SWIFT|BIC|ACCOUNT\s*NO|BENEFICIAL\s*BANK|BENEFICIARY)\b/.test(norm(line.text)));
  if (!selected.length) return undefined;
  const value = selected.map(line => line.text.trim()).filter(Boolean).join(" | ");
  const box: CanonicalBBox = {
    x0: Math.min(...selected.map(line => line.bbox.x0)), y0: Math.min(...selected.map(line => line.bbox.y0)),
    x1: Math.max(...selected.map(line => line.bbox.x1)), y1: Math.max(...selected.map(line => line.bbox.y1)),
  };
  return { value, line: { text: value, bbox: box, source: selected.some(line => line.source === "OCR") ? "OCR" as const : "NATIVE_TEXT" as const, pageNumber } };
}

function exchangeRate(lines: EvidenceLine[]) {
  const labels=lines.filter(l=>/\b(?:DOVIZ\s*KURU|EXCHANGE\s*RATE|FX\s*RATE)\b/.test(norm(l.text)));
  for(const label of labels){
    const same=lines.filter(l=>l.pageNumber===label.pageNumber && sameRow(l,label) && l.bbox.x0>=label.bbox.x0-.02);
    const nums=same.flatMap(l=>Array.from(l.text.matchAll(/-?\d[\d.,]*\d|\d/g)).map(m=>({n:parseMoney(m[0]),line:l})))
      .filter((x):x is {n:number;line:EvidenceLine}=>x.n!==undefined && x.n>0);
    if(nums.length) return nums[0];
  }
  return undefined;
}

function monetaryPairs(line: EvidenceLine): Array<{ n: number; currency: string; line: EvidenceLine; index: number }> {
  const out: Array<{ n: number; currency: string; line: EvidenceLine; index: number }> = [];
  const re = /(-?\d[\d.,]*\d|\d)\s*(TRY|TL|EUR|USD|GBP|CHF|JPY|CNY|RUB|AED|SAR|₺|€|\$|£)\b/giu;
  for (const match of line.text.matchAll(re)) {
    const n = parseMoney(match[1] ?? "");
    const currency = currencyToken(match[2] ?? "");
    if (n === undefined || !currency) continue;
    out.push({ n, currency, line, index: match.index ?? Number.MAX_SAFE_INTEGER });
  }
  return out;
}

function totalAmount(lines:EvidenceLine[]) {
  const labels=lines.filter(l=>/\b(ODENECEK\s*TUTAR|GENEL\s*TOPLAM|MAL\s*HIZMET\s*TOPLAM\s*TUTARI|TOPLAM\s*TUTAR)\b/.test(norm(l.text)));
  for(const label of labels){
    const same=lines.filter(l=>l.pageNumber===label.pageNumber && sameRow(l,label) && l.bbox.x0>=label.bbox.x0-.02)
      .sort((a,b)=>a.bbox.x0-b.bbox.x0);

    // Keep amount and currency as one semantic token.  A payable row may expose
    // both the transaction amount and its local-currency TRY equivalent. Picking
    // the numerically largest value detached from its currency can manufacture an
    // impossible pair such as "1,657,456.20 EUR" from "31,081.10 EUR /
    // 1,657,456.20 TRY". The first explicit amount+currency pair after the label
    // is the payable transaction amount; later pairs remain informational evidence.
    const paired=same.flatMap(monetaryPairs).sort((a,b)=>a.line.bbox.x0-b.line.bbox.x0 || a.index-b.index);
    if(paired.length) return paired[0];

    // Compatibility fallback for invoices whose total has no printed currency on
    // the same visual row. Preserve the old numeric discovery, but never use the
    // "largest number wins" heuristic. The first value after the explicit label
    // is the only bounded choice.
    const nums=same.flatMap(l=>Array.from(l.text.matchAll(/-?\d[\d.,]*\d|\d/g)).map(m=>({n:parseMoney(m[0]),line:l})))
      .filter((x):x is {n:number;line:EvidenceLine}=>x.n!==undefined);
    if(nums.length) return nums[0];
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
  const payment=paymentType(lines);
  if(payment)add(fields,candidate("trade.paymentType",payment.value,"trade-payment-type",segmentId,payment.line,.99));
  const freight=labelledMoney(lines,/^NAVLUN\b|\bFREIGHT\b/);
  if(freight)add(fields,candidate("finance.freight",freight.n,"finance-freight",segmentId,freight.line,.99));
  const insurance=labelledMoney(lines,/^SIGORTA\b|\bINSURANCE\b/);
  if(insurance)add(fields,candidate("finance.insurance",insurance.n,"finance-insurance",segmentId,insurance.line,.99));
  const bank=bankInfo(lines);
  if(bank)add(fields,candidate("finance.bankInfo",bank.value,"finance-bank-info",segmentId,bank.line,.97));
  const rate=exchangeRate(lines);
  if(rate)add(fields,candidate("finance.exchangeRate",rate.n,"finance-exchange-rate",segmentId,rate.line,.99));
  const total=totalAmount(lines);
  if(total){
    add(fields,candidate("header.totalAmount",total.n,"header-total-amount",segmentId,total.line,.98));

    /*
     * Invoice currency is deliberately bound to the selected invoice-total
     * evidence. A document may also contain exchange-rate rows such as
     * "53,3268 TRY"; those are not the invoice currency.
     */
    const totalCurrency="currency" in total ? total.currency : currencyToken(total.line.text);
    if(totalCurrency){
      add(fields,candidate("header.currency",totalCurrency,"header-currency-from-total",segmentId,total.line,.99));
    }
  }

  return {version:"1",fields};
}
