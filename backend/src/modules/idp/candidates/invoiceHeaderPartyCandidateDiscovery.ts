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

const EXTRACTOR = "invoice-header-party-generic-v6";

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

function semanticWords(text: string): string {
  return norm(text).replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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

function parseEnglishDate(raw: string): string | undefined {
  const monthNames: Record<string, string> = { JAN: "01", JANUARY: "01", FEB: "02", FEBRUARY: "02", MAR: "03", MARCH: "03", APR: "04", APRIL: "04", MAY: "05", JUN: "06", JUNE: "06", JUL: "07", JULY: "07", AUG: "08", AUGUST: "08", SEP: "09", SEPT: "09", SEPTEMBER: "09", OCT: "10", OCTOBER: "10", NOV: "11", NOVEMBER: "11", DEC: "12", DECEMBER: "12" };
  const match = norm(raw).match(/\b(\d{1,2})(?:ST|ND|RD|TH)?[\s-]+([A-Z]+)[,\s-]+((?:20)?\d{2})\b|\b([A-Z]+)[\s-]+(\d{1,2})(?:ST|ND|RD|TH)?(?:,\s*|[\s-]+)((?:20)?\d{2})\b/);
  if (!match) return undefined;
  const day = match[1] ?? match[5];
  const month = monthNames[match[2] ?? match[4] ?? ""];
  let year = match[3] ?? match[6];
  if (!day || !month || !year) return undefined;
  if (/^\d{2}$/.test(year)) year = `20${year}`;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function explicitInvoiceNumber(lines: EvidenceLine[]): { value: string; line: EvidenceLine } | undefined {
  const labels = lines.filter(line => /\b(?:FATURA\s*NO|INVOICE\s*(?:NO|NUMBER)|PRO-?INV\s*NO|RECHNUNGS?-?NR)\b/.test(norm(line.text)));
  for (const label of labels) {
    const inline = label.text.match(/(?:FATURA\s*NO|INVOICE\s*(?:NO|NUMBER)|PRO-?INV\s*NO|RECHNUNGS?-?NR)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9./-]{3,30})/i)?.[1];
    if (inline && !/^(?:DATE|DATUM)$/i.test(inline)) return { value: inline, line: label };
    const nearby = lines.filter(line => line.pageNumber === label.pageNumber && line !== label)
      .filter(line => centerY(line.bbox) >= centerY(label.bbox) - 0.004 && centerY(line.bbox) <= centerY(label.bbox) + 0.045)
      .filter(line => line.bbox.x0 >= label.bbox.x0 - 0.02)
      .sort((a,b) => Math.abs(centerY(a.bbox)-centerY(label.bbox)) - Math.abs(centerY(b.bbox)-centerY(label.bbox)) || a.bbox.x0-b.bbox.x0);
    for (const line of nearby) {
      const token = line.text.match(/\b[A-Z0-9][A-Z0-9./-]{3,30}\b/i)?.[0];
      if (token && /\d/.test(token) && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(token)) return { value: token, line };
    }
  }
  return undefined;
}

function invoiceNumber(
  lines: EvidenceLine[],
): { value: string; line: EvidenceLine } | undefined {
  const explicit = explicitInvoiceNumber(lines);
  if (explicit) return explicit;
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
  const labels = lines.filter(line => /\b(?:FATURA TARIHI|INVOICE DATE|DATE OF INVOICE|DATUM)\b/.test(semanticWords(line.text)));
  const dateFromLine = (line: EvidenceLine): string | undefined => {
    const numeric = line.text.match(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}\b/)?.[0];
    return numeric ? cleanDate(numeric) : parseEnglishDate(line.text);
  };
  for (const label of labels) {
    const inline = dateFromLine(label);
    if (inline) return { value: inline, line: label };
    const nearby = lines.filter(line => line.pageNumber === label.pageNumber && line !== label)
      .filter(line => centerY(line.bbox) >= centerY(label.bbox) - 0.004 && centerY(line.bbox) <= centerY(label.bbox) + 0.045)
      .filter(line => line.bbox.x0 >= label.bbox.x0 - 0.02)
      .sort((a,b) => Math.abs(centerY(a.bbox)-centerY(label.bbox)) - Math.abs(centerY(b.bbox)-centerY(label.bbox)) || a.bbox.x0-b.bbox.x0);
    for (const line of nearby) { const value = dateFromLine(line); if (value) return { value, line }; }
  }
  const combined = lines.find(line => /\b(?:PRO-?INV|INVOICE)\s*NO\.?\s*&\s*DATE\b/.test(norm(line.text)));
  if (combined) {
    const nearby = lines.filter(line => line.pageNumber === combined.pageNumber && line !== combined)
      .filter(line => centerY(line.bbox) >= centerY(combined.bbox) - 0.004 && centerY(line.bbox) <= centerY(combined.bbox) + 0.05)
      .filter(line => line.bbox.x0 >= combined.bbox.x0 - 0.02)
      .sort((a,b) => Math.abs(centerY(a.bbox)-centerY(combined.bbox)) - Math.abs(centerY(b.bbox)-centerY(combined.bbox)));
    for (const line of nearby) { const value = parseEnglishDate(line.text); if (value) return { value, line }; }
  }
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



const SELLER_ROLE_RE = /^(?:SATICI|GONDERICI|IHRACATCI|SELLER|SUPPLIER|EXPORTER|SHIPPER|ABSENDER|VERKAEUFER|VERKAUFER)(?:\s*[:\/-]|\b)/;
const BUYER_ROLE_RE = /^(?:ALICI|MUSTERI|ITHALATCI|BUYER|CUSTOMER|IMPORTER|CONSIGNEE|BILL\s+TO|SOLD\s+TO|RECHNUNG\s+AN|KUNDE|EMPFAENGER|EMPFANGER|FIRMA\s*\/\s*ADRESSE|FIRMA|TO)(?:\s*[:\/-]|\b)/;
const PARTY_BLOCK_STOP_RE = /^(?:SATICI|GONDERICI|IHRACATCI|SELLER|SUPPLIER|EXPORTER|SHIPPER|ABSENDER|VERKAEUFER|VERKAUFER|ALICI|MUSTERI|ITHALATCI|BUYER|CUSTOMER|IMPORTER|CONSIGNEE|BILL\s+TO|SOLD\s+TO|RECHNUNG\s+AN|KUNDE|EMPFAENGER|EMPFANGER|FIRMA\s*\/\s*ADRESSE|FIRMA|TO|FATURA|INVOICE|RECHNUNG|TARIH|DATE|DATUM|MALZEME|HIZMET|DESCRIPTION|BESCHREIBUNG|POS\b|ITEM\b)/;
const PARTY_STRUCTURAL_ADDRESS_RE = /^(?:ADDRESS|ADRESSE|ADRES|ADRESI|ANSCHRIFT)\s*:?$/;

function roleValueOnLine(line: EvidenceLine, role: RegExp): string | undefined {
  const normalized = norm(line.text);
  const match = normalized.match(role);
  if (!match) return undefined;
  const raw = line.text.trim();
  // A slash can be part of the semantic role itself (for example "Firma / Adresse").
  // Treat only explicit value separators as inline-value boundaries; otherwise the
  // structural word after the slash could be promoted as the company name.
  const separators = [raw.indexOf(":"), raw.indexOf("-")].filter(x => x >= 0);
  if (!separators.length) return undefined;
  const value = raw.slice(Math.min(...separators) + 1).trim();
  return looksLikePartyName(value) ? value : undefined;
}

function isLegalSuffixContinuation(text: string): boolean {
  const value = semanticWords(text);
  return /^(?:(?:LIMITED|LTD|SIRKETI|SIRKET|GMBH|LLC|INC|CORP|CORPORATION|SA|AS)(?:\s+|$)){1,4}$/.test(value);
}

function explicitRoleParty(
  lines: EvidenceLine[],
  role: RegExp,
): { name: EvidenceLine; address?: { value: string; lines: EvidenceLine[] }; country?: { value: string; line: EvidenceLine } } | undefined {
  const label = lines.find(line => role.test(norm(line.text)));
  if (!label) return undefined;
  const samePage = lines
    .filter(line => line.pageNumber === label.pageNumber)
    .filter(line => centerY(line.bbox) >= centerY(label.bbox) - 0.002)
    .filter(line => centerY(line.bbox) <= centerY(label.bbox) + 0.16)
    .filter(line => Math.abs(line.bbox.x0 - label.bbox.x0) <= 0.18)
    .sort((a,b) => centerY(a.bbox)-centerY(b.bbox) || a.bbox.x0-b.bbox.x0);

  const inline = roleValueOnLine(label, role);
  let name: EvidenceLine | undefined = inline ? { ...label, text: inline } : undefined;
  if (!name) {
    name = samePage.find(line => line !== label && sameVisualRow(line, label) && line.bbox.x0 > label.bbox.x1 - 0.01 && looksLikePartyName(line.text) && !PARTY_BLOCK_STOP_RE.test(norm(line.text)) && !PARTY_STRUCTURAL_ADDRESS_RE.test(norm(line.text)));
  }
  if (!name) {
    name = samePage.find(line => line !== label && centerY(line.bbox) > centerY(label.bbox) + 0.001 && looksLikePartyName(line.text) && !PARTY_BLOCK_STOP_RE.test(norm(line.text)) && !PARTY_STRUCTURAL_ADDRESS_RE.test(norm(line.text)));
  }
  if (!name) return undefined;

  const partyName = name;
  const continuation = samePage
    .filter(line => line !== partyName && centerY(line.bbox) > centerY(partyName.bbox) + 0.001)
    .filter(line => centerY(line.bbox) - centerY(partyName.bbox) <= 0.025)
    .filter(line => Math.abs(line.bbox.x0 - partyName.bbox.x0) <= 0.035)
    .find(line => isLegalSuffixContinuation(line.text));
  if (continuation) {
    name = {
      ...name,
      text: `${name.text.trim()} ${continuation.text.trim()}`.replace(/\s+/g, " "),
      bbox: {
        x0: Math.min(name.bbox.x0, continuation.bbox.x0),
        y0: Math.min(name.bbox.y0, continuation.bbox.y0),
        x1: Math.max(name.bbox.x1, continuation.bbox.x1),
        y1: Math.max(name.bbox.y1, continuation.bbox.y1),
      },
      source: name.source === "OCR" || continuation.source === "OCR" ? "OCR" : "NATIVE_TEXT",
    };
  }

  const rows: EvidenceLine[] = [];
  let previousY = centerY(name.bbox);
  for (const line of samePage) {
    const y = centerY(line.bbox);
    if (y <= centerY(name.bbox) + 0.001 || line === label || line === continuation) continue;
    if (y - previousY > 0.035) break;
    const value = norm(line.text);
    if (PARTY_BLOCK_STOP_RE.test(value) || /^(TEL|FAX|WEB|E-?POSTA|EMAIL|VKN|VAT|TAX|VERGI|TICARET|IBAN|SWIFT|BIC)\b/.test(value)) break;
    // ADDRESS / ADRESSE / ADRES / ADRESI / ANSCHRIFT is a structural boundary,
    // not party content. Skip the label but continue collecting the address rows.
    if (PARTY_STRUCTURAL_ADDRESS_RE.test(value)) {
      previousY = y;
      continue;
    }
    rows.push(line);
    previousY = y;
  }

  let country: { value: string; line: EvidenceLine } | undefined;
  const terminal = rows.at(-1);
  if (terminal) {
    const value = terminal.text.trim();
    const normalized = norm(value);
    const legalOrBusinessText = /\b(?:LIMITED|LTD|GMBH|LLC|INC|CORP|CORPORATION|SIRKETI|SIRKET|SANAYI|TICARET|COMPANY|INDUSTRY|INDUSTRIES|HANDELSREGISTER|REGISTER|REGISTRY|VAT|TAX|VERGI|MERSIS|IBAN|SWIFT|BANK)\b/.test(normalized);
    if (/^[A-Za-zÇĞİÖŞÜçğıöşüÄÖÜäöüß .'-]{3,40}$/.test(value) && !/\d/.test(value) && value.split(/\s+/).length <= 4 && !legalOrBusinessText) {
      country = { value, line: terminal };
    }
  }
  const addressRows = rows.filter(line => line !== country?.line);
  const addressValue = addressRows.map(line => line.text.trim()).join(", ").replace(/\s+/g," ").trim();
  return { name, address: addressValue ? { value: addressValue, lines: addressRows } : undefined, country };
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
    if (/^(?:SIRA|SL\s*NO|ITEM|DESCRIPTION|ACIKLAMA|MALZEME|MIKTAR|QUANTITY|BIRIM|UNIT|GTIP|HSN|HS\s*CODE|RATE|AMOUNT|TUTAR)\b/.test(v)) return false;
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

  // Country authority is terminal: do not scan backwards past administrative,
  // legal or malformed address rows looking for a country-looking phrase.
  const line=rows.at(-1);
  if(!line) return undefined;
  const v=line.text.trim(), n=norm(v);
  if(!/^[A-Za-zÇĞİÖŞÜçğıöşü .'-]{3,40}$/.test(v)) return undefined;
  if(/\d/.test(v)||v.split(/\s+/).length>4) return undefined;
  if(/\b(?:LIMITED|LTD|GMBH|LLC|INC|CORP|CORPORATION|SIRKETI|SIRKET|SANAYI|TICARET|COMPANY|INDUSTRY|HANDELSREGISTER|REGISTER|REGISTRY|VAT|TAX|VERGI|MERSIS|IBAN|SWIFT|BANK)\b/.test(n)) return undefined;
  return {value:v,line};
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

  const explicitSeller = explicitRoleParty(lines, SELLER_ROLE_RE);
  const explicitBuyer = explicitRoleParty(lines, BUYER_ROLE_RE);
  const seller = explicitSeller?.name ?? sellerParty(lines);
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

  const buyer = explicitBuyer?.name ?? buyerParty(lines);
  if (buyer) {
    add(fields, candidate("parties.buyer.name", buyer.text.trim(), "party-buyer-name", segmentId, buyer, 0.96));
  }

  const sayin = findSayin(lines);
  const taxNo = sellerTaxNo(lines, seller, sayin);
  if (taxNo) add(fields, candidate("parties.seller.taxNo", taxNo.value, "party-seller-tax-no", segmentId, taxNo.line, 0.99));

  if (explicitSeller?.address) {
    const first = explicitSeller.address.lines[0]!;
    const ev = { ...first, text: explicitSeller.address.lines.map(x=>x.text).join(" | "), bbox: {
      x0: Math.min(...explicitSeller.address.lines.map(x=>x.bbox.x0)), y0: Math.min(...explicitSeller.address.lines.map(x=>x.bbox.y0)),
      x1: Math.max(...explicitSeller.address.lines.map(x=>x.bbox.x1)), y1: Math.max(...explicitSeller.address.lines.map(x=>x.bbox.y1))
    }};
    add(fields, candidate("parties.seller.address", explicitSeller.address.value, "party-seller-address-explicit-role", segmentId, ev, 0.97));
  }
  if (explicitSeller?.country) add(fields, candidate("parties.seller.country", explicitSeller.country.value, "party-seller-country-explicit-role", segmentId, explicitSeller.country.line, 0.97));

  if (seller && sayin && !explicitSeller) {
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

  if (explicitBuyer?.address) {
    const first = explicitBuyer.address.lines[0]!;
    const ev = { ...first, text: explicitBuyer.address.lines.map(x=>x.text).join(" | "), bbox: {
      x0: Math.min(...explicitBuyer.address.lines.map(x=>x.bbox.x0)), y0: Math.min(...explicitBuyer.address.lines.map(x=>x.bbox.y0)),
      x1: Math.max(...explicitBuyer.address.lines.map(x=>x.bbox.x1)), y1: Math.max(...explicitBuyer.address.lines.map(x=>x.bbox.y1))
    }};
    add(fields, candidate("parties.buyer.address", explicitBuyer.address.value, "party-buyer-address-explicit-role", segmentId, ev, 0.97));
  }
  if (explicitBuyer?.country) add(fields, candidate("parties.buyer.country", explicitBuyer.country.value, "party-buyer-country-explicit-role", segmentId, explicitBuyer.country.line, 0.97));

  if (buyer && sayin && !explicitBuyer) {
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
