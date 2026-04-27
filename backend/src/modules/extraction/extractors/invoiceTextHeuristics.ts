/**
 * PDF’ten gelen düz metinden (OCR yok) sezgisel çıkarım.
 * Örnek: CLK2026000001021.pdf (IHRACAT / ISTISNA e-fatura metin katmanı) — kalem blokları "Karayolu" + GTİP ile biter.
 */

import { inferBuyerCountryFromAddressString } from "../../../common/utils/inferBuyerCountryFromAddress.js";

function parseAmount(raw: string): number | undefined {
  const s = raw.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return undefined;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let nStr = s;
  if (lastComma > lastDot) {
    nStr = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    nStr = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    nStr = s.replace(",", ".");
  }
  const n = Number(nStr);
  return Number.isFinite(n) ? n : undefined;
}

/** Binlik ayırıcı nokta: 1.600 → 1600 (miktar). */
function parseQuantityToken(raw: string): number | undefined {
  const t = raw.trim();
  if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) {
    return Number(t.replace(/\./g, ""));
  }
  return parseAmount(t);
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  const flat = text.replace(/\s+/g, " ");
  for (const re of patterns) {
    const m = flat.match(re) ?? text.match(re);
    if (m) return m;
  }
  return null;
}

function toIsoDate(dmy: string): string | undefined {
  const parts = dmy.split(/[./-]/).map((p) => p.trim());
  if (parts.length !== 3) return undefined;
  const [a, b, c] = parts;
  if (!a || !b || !c) return undefined;
  let day = a;
  let month = b;
  let year = c;
  if (c.length === 2) {
    year = `20${c}`;
  }
  if (a.length === 4) {
    year = a;
    month = b;
    day = c;
  }
  const d = day.padStart(2, "0");
  const mo = month.padStart(2, "0");
  if (d.length > 2 || mo.length > 2 || year.length !== 4) return undefined;
  return `${year}-${mo}-${d}`;
}

function lineAfterLabel(block: string, label: RegExp): string | undefined {
  const m = block.match(new RegExp(`${label.source}\\s*[:\\-]?\\s*([^\\n]{3,240})`, label.flags));
  return m?.[1]?.trim();
}

interface ParsedGoodsLine {
  lineNo: number;
  hsCode: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
}

/** CLK örneği: blok "\n{no}\n" ile başlar, "Karayolu {GTİP}" ile biter. */
function parseGoodsBlocksKarayolu(fullText: string): ParsedGoodsLine[] {
  const out: ParsedGoodsLine[] = [];
  const re = /\n(\d{1,3})\n([\s\S]*?)\bKarayolu\s+(\d{12})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    const blockNo = Number(m[1]);
    const body = m[2].trim();
    const hsCode = m[3];
    out.push(parseSingleItemBlock(body, blockNo, hsCode));
  }
  return out;
}

function parsePrimaryEurLineTotal(bl: string[]): number | undefined {
  let best: number | undefined;
  for (let i = 0; i < bl.length; i++) {
    const line = bl[i]!;
    if (line.includes("%")) continue;
    let m = line.match(/^EUR\s+([\d.]+,\d{2}|[\d.,]+)\s*$/);
    if (!m && line === "EUR" && i + 1 < bl.length) {
      const nxt = bl[i + 1]!.trim();
      if (/^[\d.]+,\d{2}$/.test(nxt) || /^[\d.,]+$/.test(nxt)) {
        m = [line, nxt] as RegExpMatchArray;
        i++;
      }
    }
    if (m?.[1]) {
      const v = parseAmount(m[1]);
      if (v !== undefined && v > 1) {
        if (best === undefined || v > best) best = v;
      }
    }
  }
  return best;
}

function parseSingleItemBlock(body: string, lineNo: number, hsCode: string): ParsedGoodsLine {
  const bl = body.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const lineTotal = parsePrimaryEurLineTotal(bl);

  let unitPrice: number | undefined;
  const adetM = body.match(/Adet\s+([\d.,]+)/i);
  if (adetM?.[1]) unitPrice = parseAmount(adetM[1]);

  let quantity: number | undefined;
  const adetIdx = bl.findIndex((l) => /^Adet\b/i.test(l));
  if (adetIdx > 0) {
    const qLine = bl[adetIdx - 1]!;
    if (/^[\d.,]+$/.test(qLine) || /^\d{1,3}(?:\.\d{3})+$/.test(qLine)) {
      quantity = parseQuantityToken(qLine);
    }
  }

  const descParts: string[] = [];
  const stopIdx = adetIdx >= 0 ? adetIdx - (quantity !== undefined ? 2 : 1) : bl.length;
  for (let i = 0; i < Math.max(0, stopIdx); i++) {
    const line = bl[i]!;
    if (/^[A-Z0-9]{10,28}$/.test(line) && /[0-9]/.test(line) && /[A-Z]/.test(line)) {
      continue;
    }
    if (/^EUR\b/i.test(line)) break;
    descParts.push(line);
  }
  const description = descParts.join(" ").replace(/\s{2,}/g, " ").trim().slice(0, 500);

  return {
    lineNo,
    hsCode,
    description: description || body.slice(0, 400),
    quantity,
    unit: "Adet",
    unitPrice,
    lineTotal
  };
}

const KNOWN_UNITS = new Set([
  "KGM",
  "KG",
  "NIU",
  "C62",
  "SET",
  "PCS",
  "PCE",
  "ADET",
  "MTR",
  "LTR"
]);

function isNumericToken(tok: string): boolean {
  const t = tok.trim();
  if (!t || !/^[\d.,-]+$/.test(t)) return false;
  return parseAmount(t) !== undefined;
}

function parseGoodsLineFromTokens(tokens: string[], hsIndex: number, lineNo: number, hsCode: string): ParsedGoodsLine {
  const right = tokens.slice(hsIndex + 1);
  let i = right.length - 1;
  const numsFromRight: number[] = [];
  const maxNums = 3;
  while (i >= 0 && isNumericToken(right[i]!) && numsFromRight.length < maxNums) {
    const n = parseAmount(right[i]!);
    if (n === undefined) break;
    numsFromRight.push(n);
    i--;
  }
  let unit: string | undefined;
  if (i >= 0) {
    const cand = right[i]!.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cand.length >= 2 && cand.length <= 8 && KNOWN_UNITS.has(cand)) {
      unit = cand;
      i--;
    }
  }
  const descTokens = right.slice(0, i + 1);
  const description = descTokens.join(" ").replace(/\s{2,}/g, " ").trim();
  let lineTotal: number | undefined;
  let unitPrice: number | undefined;
  let quantity: number | undefined;
  if (numsFromRight.length === 1) lineTotal = numsFromRight[0];
  else if (numsFromRight.length === 2) {
    lineTotal = numsFromRight[0];
    unitPrice = numsFromRight[1];
  } else if (numsFromRight.length >= 3) {
    lineTotal = numsFromRight[0];
    unitPrice = numsFromRight[1];
    quantity = numsFromRight[2];
  }
  return {
    lineNo,
    hsCode,
    description: description.length >= 1 ? description.slice(0, 500) : "",
    quantity,
    unit,
    unitPrice,
    lineTotal
  };
}

function parseGoodsLinesSingleLine(text: string): ParsedGoodsLine[] {
  const goodsLines: ParsedGoodsLine[] = [];
  const lines = text.split("\n").map((l) => l.trim());
  let lineNo = 0;
  for (const line of lines) {
    if (!line) continue;
    const hm = line.match(/\b(\d{10,12})\b/);
    if (!hm) continue;
    const hsRaw = hm[1]!;
    if (hsRaw.length < 10) continue;
    const tokens = line.split(/\s+/).filter(Boolean);
    const hsIndex = tokens.findIndex((t) => t === hsRaw);
    if (hsIndex < 0) continue;
    lineNo += 1;
    goodsLines.push(parseGoodsLineFromTokens(tokens, hsIndex, lineNo, hsRaw));
    if (goodsLines.length >= 80) break;
  }
  return goodsLines;
}

/** Adres serbest metni; `Adres:` satırı (CLK PDF) adresin parçası — bitiş sayılmaz. */
function lineClosesFreeformAddressAfterName(line: string): boolean {
  const t = line.trim();
  if (/^Adres\s*:/i.test(t)) return false;
  return /^(?:Tel|Fax|Web\s*Sitesi|E-Posta|Vergi\s*Dairesi|VKN|TİCARESİCİLNO|TİCARETSİCİLNO|TICARETSICILNO|MERSISNO|MERSİSNO)\s*:/i.test(
    t
  );
}

function normalizeInvoiceWhitespace(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/\u2007/g, " ");
}

function trimLeadingPdfNoiseLines(lines: string[]): string[] {
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!.trim();
    if (!l) {
      i++;
      continue;
    }
    if (/^e\s*[-]?\s*fatura/i.test(l)) {
      i++;
      continue;
    }
    if (/^T\.C\.\s*/i.test(l) && /Hazine|Maliye|Gelir/i.test(l)) {
      i++;
      continue;
    }
    if (/^TASLAK$/i.test(l)) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i);
}

function extractVknFromText(block: string): string | undefined {
  const t = normalizeInvoiceWhitespace(block);
  const m =
    t.match(/\bVKN\s*[:：]\s*(\d{10,11})\b/i) ??
    t.match(/\bVKN\s*[.:]\s*(\d{10,11})\b/i) ??
    t.match(/\bVKN\s+(\d{10,11})\b/i);
  return m?.[1];
}

function isBuyerBlockTerminator(trimmedLine: string): boolean {
  if (!trimmedLine) return false;
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(trimmedLine)) return true;
  if (/^ETTN\s*:/i.test(trimmedLine)) return true;
  if (/^Özelleştirme\s*No/i.test(trimmedLine)) return true;
  if (/^Senaryo\s*:/i.test(trimmedLine)) return true;
  if (/^Fatura\s*Türü/i.test(trimmedLine)) return true;
  return false;
}

/**
 * Alıcı: SAYIN sonrası (blok sonlandırıcıya kadar).
 * Gönderici: çoğu PDF'te SAYIN öncesi; SAYIN ilk satırsa (IHR vb.) metinde gönderici genelde alıcıdan sonra —
 * önce "İrsaliye Tarihi:", yoksa "Fatura Tarihi:" satırının hemen ardından, "e-FATURA" / "ETTN" / tablo öncesi.
 */
function extractSellerLinesWhenSayinIsFirst(lines: string[]): string[] {
  if (lines.length < 2) return [];
  let i = 1;
  while (i < lines.length) {
    if (isBuyerBlockTerminator(lines[i]!.trim())) break;
    i++;
  }
  /** Blok sonlandırıcı hiç yoksa (seyrek PDF), yine de Fatura Tarihi aranır. */
  const scanFrom = i < lines.length ? i : 1;
  let anchor = -1;
  const irsaliyeRe = /^\s*İrsaliye\s*Tarihi\s*:/i;
  const faturaTarihiRe = /^\s*Fatura\s*Tarihi\s*:/i;
  for (let j = scanFrom; j < lines.length; j++) {
    if (irsaliyeRe.test(lines[j]!)) {
      anchor = j + 1;
      break;
    }
  }
  if (anchor < 0) {
    for (let j = scanFrom; j < lines.length; j++) {
      if (faturaTarihiRe.test(lines[j]!)) {
        anchor = j + 1;
        break;
      }
    }
  }
  if (anchor < 0 || anchor >= lines.length) return [];
  const start = anchor;
  let end = start;
  while (end < lines.length) {
    const t = lines[end]!.trim();
    if (/^e\s*[-]?\s*fatura/i.test(t)) break;
    if (/\be\s*[-]?\s*fatura\b/i.test(t)) break;
    if (/^ETTN\s*:/i.test(t)) break;
    if (/^Sıra\s*$/i.test(t)) break;
    end++;
  }
  return lines.slice(start, end);
}

function splitEfaturaSellerBuyerLines(fullText: string): { sellerLines: string[]; buyerLines: string[] } | null {
  const lines = fullText.replace(/\r\n/g, "\n").split("\n");
  let sayinIdx = -1;
  let buyerFirstFromSameLine: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    const inline = t.match(/^SAYIN\s+(.+)/i);
    if (inline?.[1]?.trim()) {
      sayinIdx = i;
      buyerFirstFromSameLine = inline[1].trim();
      break;
    }
    if (/^SAYIN\s*$/i.test(t)) {
      sayinIdx = i;
      break;
    }
  }
  if (sayinIdx < 0) return null;

  const sellerLines =
    sayinIdx > 0 ? lines.slice(0, sayinIdx) : extractSellerLinesWhenSayinIsFirst(lines);
  const after = lines.slice(sayinIdx + 1);
  const buyerOut: string[] = [];
  if (buyerFirstFromSameLine) buyerOut.push(buyerFirstFromSameLine);

  let j = 0;
  while (j < after.length && after[j]!.trim() === "") j++;
  for (; j < after.length; j++) {
    const raw = after[j]!;
    const tr = raw.trim();
    if (isBuyerBlockTerminator(tr)) break;
    buyerOut.push(raw);
  }

  return { sellerLines, buyerLines: buyerOut };
}

function parseEfaturaPartyBlock(rawLines: string[]): { name?: string; address?: string; taxNo?: string } {
  const nonEmpty = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const lines = trimLeadingPdfNoiseLines(nonEmpty);
  if (lines.length === 0) return {};

  const blockText = normalizeInvoiceWhitespace(lines.join("\n"));
  const taxNo = extractVknFromText(blockText);

  let nameLine = lines[0]!;
  const firmaM = nameLine.match(/^Firma\s*Adı\s*:\s*(.+)$/i);
  if (firmaM?.[1]) nameLine = firmaM[1].trim();

  let endAddr = lines.length;
  for (let i = 1; i < lines.length; i++) {
    if (lineClosesFreeformAddressAfterName(lines[i]!)) {
      endAddr = i;
      break;
    }
  }

  const name = nameLine.replace(/\s+/g, " ").trim().slice(0, 240);
  const addressParts: string[] = [];
  for (let i = 1; i < endAddr; i++) {
    let seg = normalizeInvoiceWhitespace(lines[i]!).trim();
    const adm = seg.match(/^Adres\s*:\s*(.*)$/i);
    if (adm) seg = adm[1]!.trim();
    if (seg) addressParts.push(seg);
  }
  const address = addressParts.join(" ").replace(/\s{2,}/g, " ").trim().slice(0, 500);

  return {
    name: name || undefined,
    address: address || undefined,
    taxNo
  };
}

function applyEfaturaParties(
  parties: Record<string, Record<string, unknown>>,
  text: string
): void {
  const split = splitEfaturaSellerBuyerLines(text);
  if (!split) return;

  const seller = parseEfaturaPartyBlock(split.sellerLines);
  if (seller.name) parties.seller.name = seller.name;
  if (seller.address) parties.seller.address = seller.address;
  if (seller.taxNo) parties.seller.taxNo = seller.taxNo;

  const buyer = parseEfaturaPartyBlock(split.buyerLines);
  if (buyer.name) parties.buyer.name = buyer.name;
  if (buyer.address) parties.buyer.address = buyer.address;
  if (buyer.taxNo) parties.buyer.taxNo = buyer.taxNo;
  if (buyer.address) {
    const ctry = inferBuyerCountryFromAddressString(buyer.address);
    if (ctry) parties.buyer.country = ctry;
  }
}

export function extractFieldsFromInvoiceText(fullText: string): Record<string, unknown> {
  const text = fullText.replace(/\r\n/g, "\n");
  const flat = text.replace(/\s+/g, " ").trim();

  const header: Record<string, unknown> = {};

  const invNo = firstMatch(flat, [
    /(?:Fatura\s*No|Invoice\s*No\.?|Fatura\s*Numaras[ıi]|Invoice\s*Number|FATURA\s*NO)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,40})/i,
    /\b(CLK[0-9A-Z\-]{6,32})\b/i,
    /\b([A-Z]{2,5}\d{8,18})\b/
  ]);
  if (invNo?.[1]) header.invoiceNo = invNo[1].trim();

  const invDateIso = flat.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (invDateIso?.[1]) {
    header.invoiceDate = invDateIso[1];
  } else {
    const invDate = firstMatch(flat, [
      /(?:Fatura\s*Tarihi|Invoice\s*Date|Date\s*of\s*Invoice)\s*[:\-]?\s*(\d{2}[./-]\d{2}[./-]\d{4})/i,
      /\b(\d{2}[./-]\d{2}[./-]\d{4})\b/
    ]);
    if (invDate?.[1]) {
      const iso = toIsoDate(invDate[1]);
      if (iso) header.invoiceDate = iso;
    }
  }

  const cur = flat.match(/\b(EUR|USD|TRY|GBP|CHF|JPY|CNY)\b/);
  if (cur) header.currency = cur[1];

  const total = firstMatch(flat, [
    /Mal\s*Hizmet\s*Toplam\s*Tutar[ıi]?\s*([\d.]+,\d{2})\s*(?:EUR|USD|TRY)?/i,
    /(?:Genel\s*Toplam|Grand\s*Total|Toplam\s*Tutar|Ödenecek\s*Tutar)\s*[:\-]?\s*([\d.]+,\d{2}|\d+[.,]\d{2})/i
  ]);
  if (total?.[1]) {
    const n = parseAmount(total[1]);
    if (n !== undefined) header.totalAmount = n;
  }

  const parties: Record<string, Record<string, unknown>> = { seller: {}, buyer: {}, notify: {} };

  applyEfaturaParties(parties, text);

  const sellerLine =
    lineAfterLabel(text, /(?:Satıcı|Seller|Vendor|Tedarikçi|Gönderen)/i) ??
    lineAfterLabel(flat, /(?:Satıcı|Seller|Vendor)/i);
  if (sellerLine && !parties.seller.name) {
    parties.seller.name = sellerLine.replace(/\s{2,}/g, " ").slice(0, 240);
  }

  const buyerLine =
    lineAfterLabel(text, /(?:Alıcı|Buyer|Customer|Müşteri|Consignee)/i) ??
    lineAfterLabel(flat, /(?:Alıcı|Buyer|Customer)/i);
  if (buyerLine && !parties.buyer.name) {
    parties.buyer.name = buyerLine.replace(/\s{2,}/g, " ").slice(0, 240);
  }

  const trade: Record<string, unknown> = {};
  const term = flat.match(/\b(EXW|FOB|FCA|FAS|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i);
  if (term) trade.deliveryTerm = term[1].toUpperCase();

  const pay = firstMatch(flat, [
    /ÖDEME\s*ŞEKLİ\s*:\s*([^-\n]{2,80}?)(?=\s*-|\s*$)/i,
    /(?:Ödeme\s*Şekli|Payment\s*Terms?|Payment\s*Type)\s*[:\-]?\s*([^-\n]{3,80})/i
  ]);
  if (pay?.[1]) {
    trade.paymentType = pay[1]
      .replace(/[-_]{3,}/g, "")
      .trim()
      .slice(0, 120);
  }

  const originM = flat.match(/MALLARIMIZ\s+([^.]+)\./i);
  if (originM?.[1]) {
    trade.origin = originM[1].trim().slice(0, 120);
  } else {
    const origin = firstMatch(flat, [
      /(?:Menşe|Origin|Country\s*of\s*origin)\s*[:\-]?\s*([A-Za-zğüşöçıİĞÜŞÖÇ\s]{3,80})/i
    ]);
    if (origin?.[1]) trade.origin = origin[1].trim().slice(0, 120);
  }

  const transport: Record<string, unknown> = {};
  const modeTr = flat.match(
    /(?:Taşıma|Gönderilme|Transport)\s*(?:Şekli|Mode|Type)?\s*[:\-]?\s*(Karayolu|Denizyolu|Havayolu|Demiryolu|Multimodal)/i
  );
  if (modeTr?.[1]) {
    transport.mode = modeTr[1];
  } else {
    const k = flat.match(/\b(Karayolu|Denizyolu|Havayolu|Demiryolu)\b/);
    if (k?.[1]) transport.mode = k[1];
  }

  const packageInfo: Record<string, unknown> = {};
  const kap = firstMatch(flat, [/TOPLAM\s*KAP\s*:\s*(\d+)\s*([A-ZÇĞİÖŞÜa-zçğıöşü]+)?/i]);
  if (kap?.[1]) packageInfo.totalPackage = Number(kap[1]);
  if (kap?.[2]) packageInfo.packageType = kap[2].trim().slice(0, 40);

  const packs = firstMatch(flat, [
    /(?:Kap\s*Adedi|Toplam\s*Kap|Total\s*Packages?|No\.?\s*of\s*Packages?)\s*[:\-]?\s*(\d+)/i
  ]);
  if (packs?.[1] && packageInfo.totalPackage === undefined) {
    packageInfo.totalPackage = Number(packs[1]);
  }

  const gross = firstMatch(flat, [
    /BRÜT\s*KG\s*:\s*([\d.,]+)/i,
    /(?:Brüt|Gross)\s*(?:Ağırlık|Weight|KG|kg)?\s*[:\-]?\s*([\d.,]+)/i
  ]);
  if (gross?.[1]) {
    const n = parseAmount(gross[1]);
    if (n !== undefined) packageInfo.grossKg = n;
  }

  const net = firstMatch(flat, [
    /NET\s*KG\s*:\s*([\d.,]+)/i,
    /(?:Net|Net\s*Ağırlık|Net\s*Weight)\s*[:\-]?\s*([\d.,]+)/i
  ]);
  if (net?.[1]) {
    const n = parseAmount(net[1]);
    if (n !== undefined) packageInfo.netKg = n;
  }

  let goodsLines: ParsedGoodsLine[] = parseGoodsBlocksKarayolu(text);
  if (goodsLines.length === 0) {
    goodsLines = parseGoodsLinesSingleLine(text);
  }

  return {
    header,
    parties,
    trade,
    transport,
    packageInfo,
    goodsLines
  };
}
