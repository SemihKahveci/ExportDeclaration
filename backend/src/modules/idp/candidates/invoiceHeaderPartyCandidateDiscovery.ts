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

const EXTRACTOR = "invoice-header-party-generic-v5";

type EvidenceLine = {
  text: string;
  bbox: CanonicalBBox;
  source: "NATIVE_TEXT" | "OCR";
  pageNumber: number;
};

function norm(text: string): string {
  return text
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U")
    .replace(/\s+/g, " ")
    .trim();
}

function unionBox(words: CanonicalWord[]): CanonicalBBox {
  return {
    x0: Math.min(...words.map((w) => w.bbox.x0)),
    y0: Math.min(...words.map((w) => w.bbox.y0)),
    x1: Math.max(...words.map((w) => w.bbox.x1)),
    y1: Math.max(...words.map((w) => w.bbox.y1)),
  };
}

function visualLines(page: CanonicalPage): EvidenceLine[] {
  if (page.lines?.length) {
    return page.lines
      .filter((line) => line.text.trim())
      .map((line: CanonicalLine) => ({
        text: line.text.trim(),
        bbox: line.bbox,
        source: line.source,
        pageNumber: page.pageNumber,
      }));
  }

  const words = page.words
    .slice()
    .sort(
      (a, b) =>
        (a.bbox.y0 + a.bbox.y1) / 2 -
          (b.bbox.y0 + b.bbox.y1) / 2 ||
        a.bbox.x0 - b.bbox.x0,
    );

  const groups: CanonicalWord[][] = [];

  for (const word of words) {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const group = groups.find((candidate) => {
      const first = candidate[0]!;
      const groupCy = (first.bbox.y0 + first.bbox.y1) / 2;
      return Math.abs(groupCy - cy) <= 0.012;
    });

    if (group) group.push(word);
    else groups.push([word]);
  }

  return groups
    .map((group) => group.sort((a, b) => a.bbox.x0 - b.bbox.x0))
    .map((group) => ({
      text: group.map((word) => word.text).join(" ").trim(),
      bbox: unionBox(group),
      source: group.some((word) => word.source === "OCR")
        ? "OCR"
        : "NATIVE_TEXT",
      pageNumber: page.pageNumber,
    }));
}

function candidate(
  field: string,
  value: unknown,
  id: string,
  segmentId: string,
  line: EvidenceLine,
  confidence: number,
): FieldCandidate {
  return {
    candidateId: id,
    field,
    value,
    confidence,
    extractor: EXTRACTOR,
    evidence: [
      {
        segmentId,
        pageNumber: line.pageNumber,
        bbox: line.bbox,
        text: line.text,
        contentSource: line.source,
      },
    ],
  };
}

function add(
  fields: Record<string, FieldCandidate[]>,
  value: FieldCandidate | undefined,
): void {
  if (value) (fields[value.field] ??= []).push(value);
}

function centerY(bbox: CanonicalBBox): number {
  return (bbox.y0 + bbox.y1) / 2;
}

function centerX(bbox: CanonicalBBox): number {
  return (bbox.x0 + bbox.x1) / 2;
}

function sameVisualRow(a: EvidenceLine, b: EvidenceLine): boolean {
  const ah = Math.max(0.006, a.bbox.y1 - a.bbox.y0);
  const bh = Math.max(0.006, b.bbox.y1 - b.bbox.y0);
  return Math.abs(centerY(a.bbox) - centerY(b.bbox)) <= Math.max(ah, bh) * 0.8;
}

function findLabel(
  lines: EvidenceLine[],
  pattern: RegExp,
): EvidenceLine | undefined {
  return lines.find((line) => pattern.test(norm(line.text)));
}

function cleanDate(raw: string): string | undefined {
  const match = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (!match) return undefined;

  return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
}

function invoiceNumber(
  lines: EvidenceLine[],
): { value: string; line: EvidenceLine } | undefined {
  const label = findLabel(lines, /\bFATURA\s*NO\b/);
  const values: Array<{ value: string; line: EvidenceLine }> = [];

  for (const line of lines) {
    if (/(IRSALIYE|ETTN)/.test(norm(line.text))) continue;

    for (const token of line.text.split(/\s+/)) {
      const value = token.replace(/[^A-Za-z0-9]/g, "");
      if (/^[A-Za-z]{3}[0-9]{13}$/.test(value)) {
        values.push({ value: value.toUpperCase(), line });
      }
    }
  }

  if (!values.length) return undefined;
  if (!label) return values.length === 1 ? values[0] : undefined;

  const sameRow = values
    .filter((entry) => sameVisualRow(entry.line, label))
    .filter((entry) => centerX(entry.line.bbox) >= centerX(label.bbox) - 0.02)
    .sort((a, b) => a.line.bbox.x0 - b.line.bbox.x0);

  if (sameRow.length) return sameRow[0];

  return values
    .slice()
    .sort(
      (a, b) =>
        Math.abs(centerY(a.line.bbox) - centerY(label.bbox)) -
        Math.abs(centerY(b.line.bbox) - centerY(label.bbox)),
    )[0];
}

function invoiceDate(
  lines: EvidenceLine[],
): { value: string; line: EvidenceLine } | undefined {
  const label = findLabel(lines, /\bFATURA\s*TARIHI\b/);
  const values: Array<{ value: string; line: EvidenceLine }> = [];

  for (const line of lines) {
    if (/(IRSALIYE|ETTN)/.test(norm(line.text))) continue;

    const match = line.text.match(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/);
    const value = match?.[0] ? cleanDate(match[0]) : undefined;
    if (value) values.push({ value, line });
  }

  if (!values.length) return undefined;
  if (!label) return values.length === 1 ? values[0] : undefined;

  const sameRow = values
    .filter((entry) => sameVisualRow(entry.line, label))
    .filter((entry) => centerX(entry.line.bbox) >= centerX(label.bbox) - 0.02)
    .sort((a, b) => a.line.bbox.x0 - b.line.bbox.x0);

  if (sameRow.length) return sameRow[0];

  // Fail closed instead of borrowing a different date such as dispatch date.
  return undefined;
}

function isNoise(text: string): boolean {
  const value = norm(text);

  return (
    !value ||
    /^(E-?FATURA|FATURA|SAYIN|WEB SITESI|E-POSTA|TEL|FAX|VKN|VERGI|TICARET|OZELLESTIRME|SENARYO|FATURA TIPI|FATURA NO|FATURA TARIHI|IRSALIYE|ETTN)\b/.test(
      value,
    )
  );
}

function looksLikePartyName(text: string): boolean {
  const value = norm(text);

  return (
    !isNoise(text) &&
    /[A-Z]/.test(value) &&
    !/^\d/.test(value) &&
    !/(CADDE|SOKAK|MAHALLE|MAH\b|NO[: ]|TEL|FAX|WWW\.|@|VERGI|VKN|TICARET SICIL|TICARETSICIL)/.test(
      value,
    )
  );
}

function companySignal(text: string): number {
  const value = norm(text);
  let score = 0;

  if (/\b(A\.?S\.?|LTD|LIMITED|LLC|INC|CORP|CORPORATION|GMBH|OU|OÜ|S\.?A\.?|S\.?R\.?L\.?)\b/.test(value)) {
    score += 4;
  }

  if (/\b(SANAYI|TICARET|ELEKTRIK|TEKNOLOJI|TECHNOLOGY|SYSTEM|SISTEM|INDUSTRY|INDUSTRIES|COMPANY)\b/.test(value)) {
    score += 2;
  }

  if (value.length >= 8 && value.length <= 100) score += 1;

  return score;
}

function findSayin(lines: EvidenceLine[]): EvidenceLine | undefined {
  return lines.find((line) => /^SAYIN\b/.test(norm(line.text)));
}

function sellerParty(
  lines: EvidenceLine[],
): EvidenceLine | undefined {
  const sayin = findSayin(lines);
  if (!sayin) return undefined;

  const sayinY = centerY(sayin.bbox);

  const candidates = lines
    .filter((line) => line.pageNumber === sayin.pageNumber)
    .filter((line) => centerY(line.bbox) < sayinY - 0.01)
    .filter((line) => line.bbox.x0 < 0.55)
    .filter((line) => looksLikePartyName(line.text))
    .map((line) => ({
      line,
      score:
        companySignal(line.text) * 10 +
        Math.max(0, 3 - Math.abs(sayinY - centerY(line.bbox)) * 10),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.line.bbox.y0 - b.line.bbox.y0);

  return candidates[0]?.line;
}

function buyerParty(
  lines: EvidenceLine[],
): EvidenceLine | undefined {
  const sayin = findSayin(lines);
  if (!sayin) return undefined;

  const sayinY = centerY(sayin.bbox);

  const candidates = lines
    .filter((line) => line.pageNumber === sayin.pageNumber)
    .filter((line) => centerY(line.bbox) > sayinY)
    .filter((line) => centerY(line.bbox) < sayinY + 0.12)
    .filter((line) => Math.abs(line.bbox.x0 - sayin.bbox.x0) < 0.12)
    .filter((line) => looksLikePartyName(line.text))
    .map((line) => ({
      line,
      score:
        companySignal(line.text) * 10 -
        Math.abs(centerY(line.bbox) - sayinY) * 10,
    }))
    .sort((a, b) => b.score - a.score || a.line.bbox.y0 - b.line.bbox.y0);

  return candidates[0]?.line;
}


function between(
  lines: EvidenceLine[],
  top: number,
  bottom: number,
  pageNumber?: number,
): EvidenceLine[] {
  return lines
    .filter(line => pageNumber === undefined || line.pageNumber === pageNumber)
    .filter(line => centerY(line.bbox) >= top && centerY(line.bbox) < bottom)
    .sort((a,b) => centerY(a.bbox)-centerY(b.bbox) || a.bbox.x0-b.bbox.x0);
}

function sellerTaxNo(lines: EvidenceLine[], seller: EvidenceLine | undefined, sayin: EvidenceLine | undefined): {value:string; line:EvidenceLine}|undefined {
  if (!seller || !sayin) return undefined;
  const block = between(lines, centerY(seller.bbox), centerY(sayin.bbox), seller.pageNumber);
  for (const line of block) {
    const m = norm(line.text).match(/\b(?:VKN|TAX(?:\s*NO)?|VAT(?:\s*NO)?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 .-]{5,20})/);
    if (!m) continue;
    const value = m[1]!.replace(/[^A-Z0-9]/g,"");
    if (value.length >= 6) return {value, line};
  }
  return undefined;
}

function addressLines(block: EvidenceLine[], party: EvidenceLine): EvidenceLine[] {
  const py = centerY(party.bbox);
  return block.filter(line => {
    if (centerY(line.bbox) <= py + 0.002) return false;
    if (Math.abs(line.bbox.x0-party.bbox.x0) > 0.16) return false;
    const v=norm(line.text);
    if (/^(TEL|FAX|WEB|E-?POSTA|VKN|VERGI|TICARET|E-?FATURA|ETTN|FATURA|IRSALIYE|OZELLESTIRME|SENARYO)/.test(v)) return false;
    return true;
  });
}

function partyAddress(
  block: EvidenceLine[],
  party: EvidenceLine,
  excludedLine?: EvidenceLine,
): {value:string; lines:EvidenceLine[]}|undefined {
  const rows=addressLines(block,party).filter(line => line !== excludedLine);
  if (!rows.length) return undefined;
  const value=rows.map(x=>x.text.trim()).join(", ").replace(/\s+/g," ").trim();
  return value ? {value,lines:rows} : undefined;
}
function buyerCountry(block: EvidenceLine[], buyer: EvidenceLine): {value:string; line:EvidenceLine}|undefined {
  const py=centerY(buyer.bbox);
  const candidates=block
    .filter(line => centerY(line.bbox)>py+0.002)
    .filter(line => Math.abs(line.bbox.x0-buyer.bbox.x0)<=0.035)
    .sort((a,b)=>centerY(a.bbox)-centerY(b.bbox));

  // Party address rows form a compact vertical run under the party name.
  // Stop at the first meaningful vertical gap so goods/header text below cannot leak in.
  const rows:EvidenceLine[]=[];
  let prevY=py;
  for(const line of candidates){
    const y=centerY(line.bbox);
    if(y-prevY>0.030) break;
    const n=norm(line.text);
    if(/^(TEL|FAX|WEB|E-?POSTA|VKN|VERGI|TICARET|FATURA|IRSALIYE|ETTN)/.test(n)) break;
    rows.push(line);
    prevY=y;
  }

  // Country is a short alphabetic terminal row inside that compact address run.
  for(const line of [...rows].reverse()){
    const v=line.text.trim();
    if(!/^[A-Za-zÇĞİÖŞÜçğıöşü .'-]{3,40}$/.test(v)) continue;
    if(/\d/.test(v)||v.split(/\s+/).length>4) continue;
    return {value:v,line};
  }
  return undefined;
}
export function discoverInvoiceHeaderPartyFieldCandidates(
  canonical: CanonicalDocument,
  segmentId: string,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const lines = canonical.pages.slice(0, 2).flatMap(visualLines);

  const number = invoiceNumber(lines);
  if (number) {
    add(
      fields,
      candidate(
        "header.invoiceNo",
        number.value,
        "header-invoice-no",
        segmentId,
        number.line,
        0.99,
      ),
    );
  }

  const date = invoiceDate(lines);
  if (date) {
    add(
      fields,
      candidate(
        "header.invoiceDate",
        date.value,
        "header-invoice-date",
        segmentId,
        date.line,
        0.99,
      ),
    );
  }

  const seller = sellerParty(lines);
  if (seller) {
    add(
      fields,
      candidate(
        "parties.seller.name",
        seller.text.trim(),
        "party-seller-name",
        segmentId,
        seller,
        0.96,
      ),
    );
  }

  const buyer = buyerParty(lines);
  if (buyer) {
    add(fields, candidate("parties.buyer.name", buyer.text.trim(), "party-buyer-name", segmentId, buyer, 0.96));
  }

  const sayin = findSayin(lines);
  const taxNo = sellerTaxNo(lines, seller, sayin);
  if (taxNo) add(fields, candidate("parties.seller.taxNo", taxNo.value, "party-seller-tax-no", segmentId, taxNo.line, 0.99));

  if (seller && sayin) {
    const block=between(lines, centerY(seller.bbox), centerY(sayin.bbox), seller.pageNumber);
    const address=partyAddress(block,seller);
    if (address) {
      const ev={...address.lines[0]!, text:address.lines.map(x=>x.text).join(" | "), bbox:{
        x0:Math.min(...address.lines.map(x=>x.bbox.x0)), y0:Math.min(...address.lines.map(x=>x.bbox.y0)),
        x1:Math.max(...address.lines.map(x=>x.bbox.x1)), y1:Math.max(...address.lines.map(x=>x.bbox.y1))
      }};
      add(fields,candidate("parties.seller.address",address.value,"party-seller-address",segmentId,ev,0.94));
    }
  }

  if (buyer && sayin) {
    const nextBoundary = lines
      .filter(x=>x.pageNumber===buyer.pageNumber)
      .filter(x=>centerY(x.bbox)>centerY(buyer.bbox) && /MALZEME|HIZMET/.test(norm(x.text)))
      .sort((a,b)=>centerY(a.bbox)-centerY(b.bbox))[0];
    const bottom=nextBoundary ? centerY(nextBoundary.bbox) : centerY(buyer.bbox)+0.14;
    const block=between(lines,centerY(buyer.bbox),bottom,buyer.pageNumber);
    const country=buyerCountry(block,buyer);
    const address=partyAddress(block,buyer,country?.line);
    if (address) {
      const ev={...address.lines[0]!, text:address.lines.map(x=>x.text).join(" | "), bbox:{
        x0:Math.min(...address.lines.map(x=>x.bbox.x0)), y0:Math.min(...address.lines.map(x=>x.bbox.y0)),
        x1:Math.max(...address.lines.map(x=>x.bbox.x1)), y1:Math.max(...address.lines.map(x=>x.bbox.y1))
      }};
      add(fields,candidate("parties.buyer.address",address.value,"party-buyer-address",segmentId,ev,0.94));
    }
    if (country) add(fields,candidate("parties.buyer.country",country.value,"party-buyer-country",segmentId,country.line,0.94));
  }

  return {
    version: "1",
    fields,
  };
}
