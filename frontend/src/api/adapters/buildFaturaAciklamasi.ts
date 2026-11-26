import type { NormalizedDeclaration } from '@/api/types/document.types';

function formatKgTr(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

/** Örnek HTML: "TOPLAM 18 KAP - BRÜT KG: 1.320 - NET KG: 1.184" */
export function buildKapKgLine(pkg: NormalizedDeclaration['packageInfo']): string {
  const parts: string[] = [];
  if (pkg.totalPackage != null && Number.isFinite(pkg.totalPackage)) {
    parts.push(`TOPLAM ${pkg.totalPackage} KAP`);
  }
  if (pkg.grossKg != null && Number.isFinite(pkg.grossKg)) {
    parts.push(`BRÜT KG: ${formatKgTr(pkg.grossKg)}`);
  }
  if (pkg.netKg != null && Number.isFinite(pkg.netKg)) {
    parts.push(`NET KG: ${formatKgTr(pkg.netKg)}`);
  }
  return parts.join(' - ');
}

function cleanNoteBlock(raw: string): string {
  return raw
    .replace(/-{4,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Yazım “Fatura açıklaması”: parse Note + kap/kilo özeti (örnek HTML formatı).
 * Kullanıcı sonra düzenleyebilir; draftFields varsa o kazanır.
 */
export function buildFaturaAciklamasi(norm: NormalizedDeclaration): string {
  const notes = (norm.invoiceNotes ?? [])
    .map((item) => cleanNoteBlock(String(item ?? '')))
    .filter(Boolean);

  const totals = buildKapKgLine(norm.packageInfo ?? {});
  const hasTotalsInNotes = notes.some((n) =>
    /TOPLAM\s+\d[\d.,]*\s*KAP|TOPLAM\s+KAP\s*[:：]?\s*\d|BR[UÜ]T\s*(?:KG|AĞIRLIK)|NET\s*(?:KG|AĞIRLIK)/i.test(n)
  );

  const blocks: string[] = [];
  if (notes.length) {
    blocks.push(notes.join('\n'));
  }

  // Note’ta kap/kilo yoksa parse packageInfo’dan örnek HTML satırını ekle
  if (totals && !hasTotalsInNotes) {
    blocks.push(totals);
  }

  // Note tamamen boşsa en azından kap/kilo satırı
  if (!blocks.length && totals) {
    blocks.push(totals);
  }

  // Firma VKN (Evrim) kesin; note’ta vergi yoksa gönderici VKN’yi ekle
  const vkn = String(norm.parties?.seller?.taxNo ?? '').replace(/\D/g, '');
  if (vkn && !blocks.some((b) => b.includes(vkn)) && !/VERG[İI]\s*NO/i.test(blocks.join('\n'))) {
    const unvan = String(norm.parties?.seller?.name ?? '').trim();
    if (unvan) {
      blocks.push(`${unvan.toLocaleUpperCase('tr-TR')} VERGİ NO: ${vkn}`);
    } else {
      blocks.push(`VERGİ NO: ${vkn}`);
    }
  }

  return blocks.join('\n');
}
