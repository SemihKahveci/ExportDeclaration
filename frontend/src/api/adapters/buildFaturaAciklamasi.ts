import type { NormalizedDeclaration } from '@/api/types/document.types';

function formatKgTr(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

function upperTr(value: string): string {
  return value.trim().toLocaleUpperCase('tr-TR');
}

/** Örnek HTML: "TOPLAM 18 KAP · BRÜT KG: 1.320 · NET KG: 1.184" */
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
  return parts.join(' · ');
}

/** "ÖRNEK PLASTİK SAN. A.Ş." → "ÖRNEK PLASTİK SAN. A.Ş.'DEN" */
export function withDenSuffix(unvan: string): string {
  const name = upperTr(unvan).replace(/'DEN\s*$/i, '').replace(/’DEN\s*$/i, '').trim();
  if (!name) return '';
  if (/[AEIİOÖUÜ]\s*$/i.test(name) || /A\.?\s*Ş\.?\s*$/i.test(name) || /AS\s*$/i.test(name)) {
    return `${name}'DEN`;
  }
  return `${name}'DEN`;
}

/** Örnek: "4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK SAN. A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111" */
export function buildTedarikLine(lineNos: number[], unvan: string, vergiNo: string): string {
  const nums = [...new Set(lineNos.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  const satir = nums.length === 0
    ? 'SATIRDAKİ ÜRÜNLER'
    : nums.length === 1
      ? `${nums[0]}. SATIRDAKİ ÜRÜNLER`
      : `${nums.join('.')}. SATIRDAKİ ÜRÜNLER`;
  const name = withDenSuffix(unvan);
  const vkn = vergiNo.replace(/\D/g, '');
  const parts = [satir];
  if (name) parts.push(`${name} TEDARİK EDİLMİŞTİR.`);
  else parts.push('TEDARİK EDİLMİŞTİR.');
  if (vkn) parts.push(`VERGİ NO: ${vkn}`);
  return parts.join(' ');
}

type TedarikHit = { lineNos: number[]; unvan: string; vergiNo: string };

function joinedNotes(norm: NormalizedDeclaration): string {
  return (norm.invoiceNotes ?? [])
    .map((item) => String(item ?? '').replace(/-{4,}/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' | ');
}

/** Note içinden "N. SATIRDAKİ … TEDARİK … VERGİ NO" kalıplarını çıkar. */
export function extractTedarikHits(notesText: string): TedarikHit[] {
  if (!notesText.trim()) return [];
  const upper = upperTr(notesText);
  const hits: TedarikHit[] = [];

  // "4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK …'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111"
  const fullRe =
    /(\d+(?:\s*[./]\s*\d+)*)\s*\.?\s*SATIR(?:DAK[İI]|LAR(?:DA)?)\s*(?:ÜRÜNLER(?:[İI])?)?\s+(.+?)(?:'DEN|’DEN|DEN)\s+TEDAR[İI]K\s+ED[İI]LM[İI][ŞS]T[İI]R\.?\s*(?:VERG[İI]\s*NO\s*[:：]?\s*(\d{10,11}))?/gi;
  for (const m of upper.matchAll(fullRe)) {
    const lineNos = m[1]!.split(/[./]/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
    const unvan = String(m[2] ?? '').replace(/\s+/g, ' ').trim();
    const vergiNo = String(m[3] ?? '').replace(/\D/g, '');
    if (unvan || vergiNo) hits.push({ lineNos, unvan, vergiNo });
  }

  if (hits.length) return hits;

  // "1-5 ... 1400384363" / "4.SATIRDAKİ ... 1111111111"
  const rangeRe = /(\d+)\s*[-–]\s*(\d+)[^\d]{0,80}?(\d{10,11})/g;
  for (const m of upper.matchAll(rangeRe)) {
    const from = Number(m[1]);
    const to = Number(m[2]);
    const vergiNo = m[3]!;
    const lineNos: number[] = [];
    for (let i = from; i <= to; i++) lineNos.push(i);
    hits.push({ lineNos, unvan: '', vergiNo });
  }

  const satirVknRe = /(\d+(?:\s*[./]\s*\d+)*)\s*\.?\s*SATIR(?:DAK[İI]|LAR(?:DA)?)[^\d]{0,100}?(\d{10,11})/g;
  for (const m of upper.matchAll(satirVknRe)) {
    const lineNos = m[1]!.split(/[./]/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
    hits.push({ lineNos, unvan: '', vergiNo: m[2]! });
  }

  // Genel "VERGİ NO: …" + mümkünse firma adı (gönderici değil, tedarikçi cümlesi)
  if (!hits.length) {
    const vkn = upper.match(/VERG[İI]\s*NO\s*[:：]?\s*(\d{10,11})/)?.[1];
    const name =
      upper.match(/([A-ZÇĞİÖŞÜ0-9.\/&\-\s]{5,80}?(?:A\.?\s*Ş\.?|LTD\.?(?:\s*ŞT[İI])?))\s*(?:'DEN|’DEN|DEN)?\s*TEDAR/i)?.[1]
      ?? '';
    if (vkn || name) {
      hits.push({ lineNos: [], unvan: name.trim(), vergiNo: vkn ?? '' });
    }
  }

  return hits;
}

function resolveKapKg(norm: NormalizedDeclaration, notesText: string): string {
  const fromPkg = buildKapKgLine(norm.packageInfo ?? {});
  if (fromPkg) return fromPkg;

  const upper = upperTr(notesText);
  const kap = upper.match(/TOPLAM\s+KAP\s*[:：]?\s*([0-9][0-9.\s,]*)/i)?.[1]
    ?? upper.match(/TOPLAM\s+([0-9][0-9.\s,]*)\s*KAP/i)?.[1];
  const brut = upper.match(/BR[UÜ]T\s*(?:KG|AĞIRLIK)?\s*[:：]?\s*([0-9][0-9.\s,]*)/i)?.[1];
  const net = upper.match(/NET\s*(?:KG|AĞIRLIK)?\s*[:：]?\s*([0-9][0-9.\s,]*)/i)?.[1];

  const parseTr = (raw?: string): number | undefined => {
    if (!raw) return undefined;
    const t = raw.replace(/\s/g, '');
    const normalized = t.includes(',')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/\./g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
  };

  return buildKapKgLine({
    totalPackage: parseTr(kap),
    grossKg: parseTr(brut),
    netKg: parseTr(net),
  });
}

/**
 * Yazım “Fatura açıklaması” — örnek HTML cümle şekli ve sırası:
 * 1) N. SATIRDAKİ ÜRÜNLER …'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: …
 * 2) TOPLAM N KAP · BRÜT KG: … · NET KG: …
 */
export function buildFaturaAciklamasi(norm: NormalizedDeclaration): string {
  const notesText = joinedNotes(norm);
  const lines: string[] = [];

  const tedarikHits = extractTedarikHits(notesText);
  for (const hit of tedarikHits) {
    const unvan = hit.unvan || String(norm.parties?.seller?.name ?? '');
    const vkn = hit.vergiNo || String(norm.parties?.seller?.taxNo ?? '').replace(/\D/g, '');
    if (!unvan && !vkn) continue;
    lines.push(buildTedarikLine(hit.lineNos, unvan, vkn));
  }

  // Note’ta tedarik yoksa: yalnızca yabancı menşe (T) kalemlerde gönderici/Firma ile cümle kur
  if (!lines.length) {
    const foreign = (norm.goodsLines ?? [])
      .filter((g) => g.manufacturerType === 'T')
      .map((g) => g.lineNo)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const unvan = String(norm.parties?.seller?.name ?? '').trim();
    const vkn = String(norm.parties?.seller?.taxNo ?? '').replace(/\D/g, '');
    if (foreign.length && unvan && vkn) {
      lines.push(buildTedarikLine(foreign, unvan, vkn));
    }
  }

  const totals = resolveKapKg(norm, notesText);
  if (totals) lines.push(totals);

  return lines.join('\n');
}
