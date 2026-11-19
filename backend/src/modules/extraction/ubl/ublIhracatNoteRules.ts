import { mapEvrimCountryNo } from "../../export-code-tables/evrimCountryCodes.js";
import type { UblParsedGoodsLine, UblParsedInvoice } from "./ublIhracatInvoice.types.js";

export type VknManufacturerLookup = (taxNo: string, nameHint?: string) => number | undefined;

/** Bozuk UTF-8 / iso-8859-9 karışımı notlarda Ü/Ğ/Ş vb. için toleranslı eşleme. */
function softUpper(text: string): string {
  return text
    .replace(/\uFFFD/g, ".")
    .replace(/ï¿½/g, ".")
    .toLocaleUpperCase("tr-TR");
}

/** Sonraki etiket / ayırıcı — ödeme/banka yakalamasını kısa tutar (\b Türkçe harfte kırılır). */
const NOTE_STOP =
  String.raw`(?=\s*(?:\|+|-{3,}|(?:ARACI\s+)?BANKA\s*[:：]|ÖDEME\s+ŞEKL|ODEME\s+SEKL|TA[SŞ]IMA\s+ŞEKL|TESL[Iİ]M\s+ŞEKL|BR.?T\s|NET\s+(?:KG|A)|KAP\s+ADED|MEN[SŞ]E|PALET\s+SAY|TOPLAM\s+KAP|IMALAT|İMALAT|PLAKA|VERG)|$)`;

function cleanBankOrPayment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*(?:ÖDEME|ODEME)\s+Ş?EKL[İI].*$/i, "")
    .replace(/[,\s|;]+$/g, "")
    .trim() || undefined;
}

/** TR fatura notu sayıları: 9.825,02 → 9825.02 · 24.900 → 24900 · 472,00 → 472 */
export function parseTrNoteNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/\s+/g, "").replace(/[.,]+$/g, "").replace(/[^\d.,-]+$/g, "");
  if (!s) return undefined;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots > 0 && commas > 0) s = s.replace(/\./g, "").replace(",", ".");
  else if (commas === 1 && dots === 0) s = s.replace(",", ".");
  else if (dots === 1 && commas === 0 && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(".", "");
  else if (dots > 1 && commas === 0) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function joinedNotes(invoice: UblParsedInvoice): string {
  const lineNotes = invoice.goodsLines.map((line) => line.lineNote ?? "");
  return [...invoice.invoiceNotes, ...lineNotes].filter(Boolean).join(" | ");
}

function firstMatchNumber(upper: string, patterns: RegExp[]): number | undefined {
  for (const re of patterns) {
    const m = upper.match(re);
    const n = parseTrNoteNumber(m?.[1]);
    if (n != null) return n;
  }
  return undefined;
}

/**
 * cbc:Note içinden kap / brüt / net / ödeme / taşıma / banka.
 * Örnek: "TOPLAM KAP : 66 PALET BRÜT KG : 9.825,02 NET KG : 7.204,01"
 */
export function applyNoteShipmentRules(invoice: UblParsedInvoice): UblParsedInvoice {
  const text = joinedNotes(invoice);
  if (!text.trim()) return invoice;
  const upper = softUpper(text);

  const totalPackage =
    invoice.totalPackage
    ?? firstMatchNumber(upper, [
      /TOPLAM\s+KAP\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /KAP\s+ADED[İI]\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /PALET\s+SAYISI\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /(?:^|\|\s*)KAP\s*[:：]\s*([0-9][0-9.\s,]*)/,
    ]);

  const grossKg =
    invoice.grossKg
    ?? firstMatchNumber(upper, [
      /TOPLAM\s+BR.?T\s+A.?IRLIK\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /BR.?T\s+A.?IRLIK\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /BR.?T\s*KG\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /BRUT\s*(?:KG|AGIRLIK|AĞIRLIK)?\s*[:：]?\s*([0-9][0-9.\s,]*)/,
    ]);

  const netKg =
    invoice.netKg
    ?? firstMatchNumber(upper, [
      /TOPLAM\s+NET\s+A.?IRLIK\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /NET\s+A.?IRLIK\s*[:：]?\s*([0-9][0-9.\s,]*)/,
      /NET\s*KG\s*[:：]?\s*([0-9][0-9.\s,]*)/,
    ]);

  let packageType = invoice.packageType;
  if (!packageType) {
    if (/PALET\s+SAYISI\s*[:：]?\s*[0-9]/i.test(upper) || /\bPALET\b/.test(upper) && /SAYISI/.test(upper)) {
      packageType = "PALET";
    } else {
      const kapWord = upper.match(/TOPLAM\s+KAP\s*[:：]?\s*[0-9][0-9.\s,]*\s*([A-ZÇĞİÖŞÜ]+)/)?.[1]
        ?? upper.match(/KAP\s+ADED[İI]\s*[:：]?\s*[0-9][0-9.\s,]*\s*([A-ZÇĞİÖŞÜ]+)/)?.[1]
        ?? upper.match(/KAP\s+ADED[İI]\s*[:：]?\s*[0-9][0-9.\s,]*\s+([A-Z]{2,10})\b/)?.[1];
      if (kapWord && !["KG", "KGM", "EUR", "USD", "TL", "NET", "BRUT", "BRÜT"].includes(kapWord)) {
        packageType = kapWord === "PALET" ? "PALET" : kapWord;
      }
    }
  }

  const paymentType =
    invoice.paymentType
    ?? text.match(new RegExp(String.raw`ÖDEME\s+ŞEKL[İI]\s*[:：]\s*([A-ZÇĞİÖŞÜa-zçğıöşü0-9 /._-]{2,60}?)${NOTE_STOP}`, "i"))?.[1]?.trim()
    ?? upper.match(new RegExp(String.raw`ODEME\s+SEKLI\s*[:：]\s*([A-Z0-9 /._-]{2,60}?)${NOTE_STOP}`))?.[1]?.trim()
    ?? upper.match(/#ODEMESEKLI\|([A-Z0-9ÇĞİÖŞÜ /._-]{2,40})/)?.[1]?.trim()
    ?? (/\bPE.{0,4}N\s+.{0,3}DEME\b|\bPESIN\b/.test(upper) ? "PEŞİN" : undefined)
    ?? (/\bMAL\s+MUKAB[İI]L[İI]\b/.test(upper) ? "MAL MUKABİLİ" : undefined);

  // Yapısal TransportModeCode varsa koru; yoksa nottan doldur.
  const transportMode =
    invoice.transportMode
    ?? text.match(new RegExp(String.raw`TA[ŞS]IMA\s+ŞEKL[İI]\s*[:：]\s*([A-ZÇĞİÖŞÜa-zçğıöşü0-9 /._-]{2,40}?)${NOTE_STOP}`, "i"))?.[1]?.trim()
    ?? upper.match(/#GONDERIMSEK\|([A-ZÇĞİÖŞÜ0-9 /._-]{2,40})/)?.[1]?.trim();

  const bankInfo =
    invoice.bankInfo
    ?? text.match(new RegExp(String.raw`ARACI\s+BANKA\s*[:：]\s*([^|]+?)${NOTE_STOP}`, "i"))?.[1]?.trim()
    ?? text.match(new RegExp(String.raw`BANKA\s*[:：]\s*([^|]+?)${NOTE_STOP}`, "i"))?.[1]?.trim()
    ?? text.match(/([A-ZÇĞİÖŞÜa-zçğıöşü0-9 .\/-]{3,80}BANKASI[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .\/,-]{0,80})/i)?.[1]?.trim()
    ?? text.match(/([A-ZÇĞİÖŞÜa-zçğıöşü][A-ZÇĞİÖŞÜa-zçğıöşü0-9 .\/-]{2,60}ŞUB\.?[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .\/-]{0,40})/i)?.[1]?.trim();

  let deliveryTerm = invoice.deliveryTerm;
  if (!deliveryTerm) {
    const fromNote = upper.match(/\b(EXW|FCA|FOB|CIF|CFR|CIP|CPT|DAP|DPU|DDP|FAS)\b/)?.[1]
      ?? upper.match(/#TESLIMSART\|([A-Z]{3})/)?.[1];
    if (fromNote) deliveryTerm = fromNote;
  }

  const cleanedPayment = cleanBankOrPayment(
    paymentType ? paymentType.replace(/^(\d+)\s*[-–]\s*/, "") : undefined
  );
  const cleanedBank = cleanBankOrPayment(bankInfo);

  return {
    ...invoice,
    ...(totalPackage != null ? { totalPackage } : {}),
    ...(grossKg != null ? { grossKg } : {}),
    ...(netKg != null ? { netKg } : {}),
    ...(packageType ? { packageType } : {}),
    ...(cleanedPayment ? { paymentType: cleanedPayment } : {}),
    ...(transportMode ? { transportMode: transportMode.replace(/\s+/g, " ").trim() } : {}),
    ...(cleanedBank ? { bankInfo: cleanedBank } : {}),
    ...(deliveryTerm ? { deliveryTerm } : {}),
  };
}

/** Menşe + sevkiyat not kurallarını birlikte uygular. */
export function enrichInvoiceFromNotes(invoice: UblParsedInvoice): UblParsedInvoice {
  const withNotes = applyNoteShipmentRules(applyNoteOriginRules(invoice));
  // Başlık kap cinsi varsa satıra yay (ActualPackage yoksa Excel/UI satırı boş kalmasın).
  if (withNotes.packageType) {
    return {
      ...withNotes,
      goodsLines: withNotes.goodsLines.map((line) =>
        line.packageType ? line : { ...line, packageType: withNotes.packageType }
      ),
    };
  }
  return withNotes;
}

/**
 * "7.KALEM BELÇİKA, 8,12.KALEMLER HİNDİSTAN 9,10 .KALEMLER TÜRKİYE"
 * ve "KALEMLER MENŞE ALMANYA ..." kalıplarını satır menşesine yayar.
 */
export function applyNoteOriginRules(invoice: UblParsedInvoice): UblParsedInvoice {
  const lines = invoice.goodsLines.map((line) => ({ ...line }));
  const notes = [...invoice.invoiceNotes, ...lines.map((line) => line.lineNote ?? "")].filter(Boolean);
  const joined = notes.join(" | ");

  // 1) Kalemde zaten origin varsa dokunma
  const missing = lines.filter((line) => !line.origin);
  if (missing.length === 0) return { ...invoice, goodsLines: lines };

  // 2) Satır numaralı dağılım
  const assigned = new Map<number, string>();
  for (const note of notes) {
    const upper = softUpper(note);
    // "8,12.KALEMLER HİNDİSTAN" / "9,10 .KALEMLER TÜRKİYE"
    const multi = [...upper.matchAll(/(\d+(?:\s*[,./]\s*\d+)*)\s*\.?\s*KALEM(?:LER)?\s*([A-ZÇĞİÖŞÜ]+)/g)];
    for (const m of multi) {
      const nums = m[1]!.split(/[,./]/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
      const country = m[2]!;
      for (const n of nums) assigned.set(n, country);
    }
    // "7.KALEM BELÇİKA"
    const singles = [...upper.matchAll(/(\d+)\s*\.\s*KALEM(?:LER)?\s*([A-ZÇĞİÖŞÜ]+)/g)];
    for (const m of singles) assigned.set(Number(m[1]), m[2]!);

    // "1 VE 3 NOLU KALEMLER TÜRKİYE, DİĞERLERİ ALMANYA MENŞEİLİDİR"
    const nolu = [...upper.matchAll(/(\d+(?:\s*(?:VE|,|\/)\s*\d+)*)\s+NOLU\s+KALEM(?:LER)?\s+([A-ZÇĞİÖŞÜ]+)/g)];
    for (const m of nolu) {
      const nums = m[1]!.split(/\s*(?:VE|,|\/)\s*/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
      for (const n of nums) assigned.set(n, m[2]!);
    }
    const digerleri = upper.match(/D[İI][ĞG]ERLER[İI]\s+([A-ZÇĞİÖŞÜ]+)\s+MEN[SŞ]E/i);
    if (digerleri && (nolu.length > 0 || assigned.size > 0)) {
      const fallback = digerleri[1]!;
      for (const line of lines) {
        if (!assigned.has(line.lineNo)) assigned.set(line.lineNo, fallback);
      }
    }
  }

  if (assigned.size > 0) {
    // Default menşe: "KALEMLER MENŞE ALMANYA" gibi
    let defaultOrigin: string | undefined;
    const defaultMatch = softUpper(joined).match(/KALEMLER\s+MEN[SŞ]E(?:İ|I)?\s+([A-ZÇĞİÖŞÜ]+)/);
    if (defaultMatch) defaultOrigin = defaultMatch[1];

    for (const line of lines) {
      if (line.origin) continue;
      line.origin = assigned.get(line.lineNo) ?? defaultOrigin;
    }
    return { ...invoice, goodsLines: lines };
  }

  // 3) Tek menşe notu → tüm boş kalemler
  let single: string | undefined;
  for (const note of notes) {
    const upper = softUpper(note);
    if (/MEN[SŞ]E[İI]?\s*[:：]?\s*T[ÜU]RK/.test(upper) || /T[ÜU]RK\s+MEN[SŞ]E/.test(upper) || /T[ÜU]RK\s+MALI/.test(upper)) {
      single = "TÜRKİYE";
      break;
    }
    const m = upper.match(/MEN[SŞ]E[İI]?\s*[:：]\s*([A-ZÇĞİÖŞÜ\s]+)/);
    if (m) {
      single = m[1]!.trim();
      break;
    }
  }
  if (single) {
    for (const line of lines) {
      if (!line.origin) line.origin = single;
    }
  }

  return { ...invoice, goodsLines: lines };
}

/**
 * İmalatçı tipi: menşe TR → I, değilse T.
 * İmalatçı ID: T → sender; I + notta VKN → lookup; yoksa sender.
 */
export function applyManufacturerRules(
  invoice: UblParsedInvoice,
  options: {
    senderEvrimId?: number;
    lookupManufacturer?: VknManufacturerLookup;
  } = {}
): Array<UblParsedGoodsLine & { manufacturerNo?: number; manufacturerType?: "I" | "T" }> {
  const withOrigin = applyNoteOriginRules(invoice).goodsLines;
  const notes = invoice.invoiceNotes.join(" | ");
  const upperNotes = softUpper(notes);

  // Evax tarzı: "1-5 ... VKN" satır aralıkları
  const rangeAssignments = new Map<number, { taxNo: string; name?: string }>();
  const rangeRe =
    /(\d+)\s*[-–]\s*(\d+)[^\d]{0,40}?(\d{10,11})/g;
  for (const m of upperNotes.matchAll(rangeRe)) {
    const from = Number(m[1]);
    const to = Number(m[2]);
    const taxNo = m[3]!;
    for (let i = from; i <= to; i++) rangeAssignments.set(i, { taxNo });
  }
  // "1.2.3.4.5.SATIRDAKİ ... 1400384363" / "6.SATIRDAKİ ... 8371251344"
  const satirRe = /(\d+(?:\s*[./]\s*\d+)*)\s*\.?\s*SATIR(?:DAK[İI]|LAR(?:DA)?)[^\d]{0,80}?(\d{10,11})/g;
  for (const m of upperNotes.matchAll(satirRe)) {
    const nums = m[1]!.split(/[./]/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
    for (const n of nums) rangeAssignments.set(n, { taxNo: m[2]! });
  }
  // Tek satır VKN
  const singleLineRe = /(?:^|\D)(\d+)\s*[.)\-]?\s*[^\d]{0,60}?(\d{10,11})/g;
  for (const m of upperNotes.matchAll(singleLineRe)) {
    const lineNo = Number(m[1]);
    if (lineNo >= 1 && lineNo <= withOrigin.length && !rangeAssignments.has(lineNo)) {
      rangeAssignments.set(lineNo, { taxNo: m[2]! });
    }
  }

  // Tek imalatçı VKN (PAG tarzı) — tip I iken kullanılır
  const globalTax = upperNotes.match(/VERG[İI]\s*NO\s*[:：]?\s*(\d{10,11})/)?.[1]
    ?? upperNotes.match(/\b(\d{10,11})\b/)?.[1];

  return withOrigin.map((line) => {
    const countryNo = mapEvrimCountryNo(line.origin);
    const manufacturerType: "I" | "T" = countryNo === "052" ? "I" : "T";
    let manufacturerNo = options.senderEvrimId;

    if (manufacturerType === "I") {
      const assigned = rangeAssignments.get(line.lineNo);
      const taxNo = assigned?.taxNo ?? (rangeAssignments.size === 0 ? globalTax : undefined);
      if (taxNo && options.lookupManufacturer) {
        const found = options.lookupManufacturer(taxNo, assigned?.name);
        if (found != null) manufacturerNo = found;
      }
    }

    return {
      ...line,
      ...(manufacturerNo != null ? { manufacturerNo } : {}),
      manufacturerType,
    };
  });
}
