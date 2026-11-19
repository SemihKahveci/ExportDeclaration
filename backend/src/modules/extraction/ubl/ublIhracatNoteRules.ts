import { mapEvrimCountryNo } from "../../export-code-tables/evrimCountryCodes.js";
import type { UblParsedGoodsLine, UblParsedInvoice } from "./ublIhracatInvoice.types.js";

export type VknManufacturerLookup = (taxNo: string, nameHint?: string) => number | undefined;

const LINE_ORIGIN_RANGE_RE =
  /(\d+)\s*(?:[-–,]\s*(\d+))?\s*(?:\.|\s)?\s*(?:KALEM(?:LER)?|SATIR(?:LAR)?)\s*([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)/gi;

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
    const upper = note.toLocaleUpperCase("tr-TR");
    // "8,12.KALEMLER HİNDİSTAN" / "9,10 .KALEMLER TÜRKİYE"
    const multi = [...upper.matchAll(/(\d+(?:\s*[,./]\s*\d+)*)\s*\.?\s*KALEM(?:LER)?\s*([A-ZÇĞİÖŞÜ]+)/g)];
    for (const m of multi) {
      const nums = m[1]!.split(/[,./]/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
      const country = mapEvrimCountryNo(m[2]!) ? m[2]! : m[2]!;
      for (const n of nums) assigned.set(n, country);
    }
    // "7.KALEM BELÇİKA"
    const singles = [...upper.matchAll(/(\d+)\s*\.\s*KALEM(?:LER)?\s*([A-ZÇĞİÖŞÜ]+)/g)];
    for (const m of singles) assigned.set(Number(m[1]), m[2]!);
  }

  if (assigned.size > 0) {
    // Default menşe: "KALEMLER MENŞE ALMANYA" gibi
    let defaultOrigin: string | undefined;
    const defaultMatch = joined.toLocaleUpperCase("tr-TR").match(/KALEMLER\s+MEN[SŞ]E(?:İ|I)?\s+([A-ZÇĞİÖŞÜ]+)/);
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
    const upper = note.toLocaleUpperCase("tr-TR");
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
  const upperNotes = notes.toLocaleUpperCase("tr-TR");

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
