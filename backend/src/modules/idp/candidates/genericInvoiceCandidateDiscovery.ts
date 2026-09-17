import type { CanonicalBBox, CanonicalDocument, CanonicalPage, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-generic-layout-v5";
const MONEY_RE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,4})$/;
const INTEGER_RE = /^\d{1,7}$/;
const DATE_TIME_RE = /(?:^|\D)\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*\d{1,2}[:.]\d{2})?(?:\D|$)/;
const CONTIGUOUS_HS_RE = /(?:^|\D)(\d{12})(?:\D|$)/;

function compactDigits(text: string): string { return text.replace(/\D/g, ""); }

function hsCodeFromText(text: string): string | undefined {
  const normalized = text.trim();
  // Dates/timestamps can collapse to exactly 12 digits; they are metadata, not HS codes.
  if (DATE_TIME_RE.test(normalized)) return undefined;
  const contiguous = CONTIGUOUS_HS_RE.exec(normalized)?.[1];
  if (contiguous) return contiguous;
  const compact = compactDigits(normalized);
  return compact.length === 12 ? compact : undefined;
}

function parseNumber(text: string): number | undefined {
  const raw = text.trim().replace(/\s/g, "");
  if (!raw) return undefined;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  else if (comma >= 0) {
    const decimals = raw.length - comma - 1;
    normalized = decimals >= 1 && decimals <= 4 ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = raw.length - dot - 1;
    normalized = decimals >= 1 && decimals <= 4 ? raw.replace(/,/g, "") : raw.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function centerY(word: CanonicalWord): number { return (word.bbox.y0 + word.bbox.y1) / 2; }
function height(word: CanonicalWord): number { return Math.max(0.001, word.bbox.y1 - word.bbox.y0); }

function unionBox(words: CanonicalWord[]): CanonicalBBox {
  return { x0: Math.min(...words.map(w => w.bbox.x0)), y0: Math.min(...words.map(w => w.bbox.y0)), x1: Math.max(...words.map(w => w.bbox.x1)), y1: Math.max(...words.map(w => w.bbox.y1)) };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Reconstruct a goods row from HS-anchor geometry rather than trusting PDF/OCR
 * line objects.  OCR may move quantity/price/amount baselines enough that a
 * fixed y tolerance misses the row completely.  Once HS anchors are known,
 * the midpoints to the neighbouring HS anchors are stronger row boundaries.
 *
 * This stays supplier/header independent: no x coordinates or fixture-specific
 * row heights are encoded here.
 */
function rowWords(
  page: CanonicalPage,
  anchor: CanonicalWord,
  previousAnchor?: CanonicalWord,
  nextAnchor?: CanonicalWord
): CanonicalWord[] {
  const anchorY = centerY(anchor);
  const local = page.words.filter(w => Math.abs(centerY(w) - anchorY) <= 0.06);
  const typicalHeight = median(local.map(height).filter(h => h > 0)) || height(anchor);
  const sourceFactor = anchor.source === "OCR" ? 2.4 : 1.45;
  const fallbackHalfBand = Math.min(
    anchor.source === "OCR" ? 0.045 : 0.032,
    Math.max(0.010, typicalHeight * sourceFactor, height(anchor) * sourceFactor)
  );

  const previousY = previousAnchor ? centerY(previousAnchor) : undefined;
  const nextY = nextAnchor ? centerY(nextAnchor) : undefined;

  // Midpoints between consecutive HS anchors partition the goods table into
  // visual rows.  For edge rows, mirror the nearest observed row spacing;
  // otherwise fall back to the adaptive word-height band.
  const upper = previousY !== undefined
    ? (previousY + anchorY) / 2
    : nextY !== undefined
      ? anchorY - Math.min(0.075, Math.max(fallbackHalfBand, (nextY - anchorY) / 2))
      : anchorY - fallbackHalfBand;
  const lower = nextY !== undefined
    ? (anchorY + nextY) / 2
    : previousY !== undefined
      ? anchorY + Math.min(0.075, Math.max(fallbackHalfBand, (anchorY - previousY) / 2))
      : anchorY + fallbackHalfBand;

  return page.words
    .filter(word => {
      const y = centerY(word);
      return y >= upper && y < lower;
    })
    .sort((a, b) => a.bbox.x0 - b.bbox.x0 || centerY(a) - centerY(b));
}
function candidate(field: string, candidateId: string, value: unknown, segmentId: string, page: CanonicalPage, words: CanonicalWord[], confidence: number): FieldCandidate {
  return { candidateId, field, value, confidence, extractor: EXTRACTOR, evidence: [{ segmentId, pageNumber: page.pageNumber, bbox: unionBox(words), text: words.map(w => w.text.trim()).filter(Boolean).join(" "), contentSource: words.some(w => w.source === "OCR") ? "OCR" : "NATIVE_TEXT" }] };
}

type NumericEvidence = { word: CanonicalWord; value: number; raw: string };

// Extract numeric fragments from mixed OCR/native tokens as well as pure numeric
// words.  OCR commonly emits values together with currency/percent text, e.g.
// "78,75 EUR" or even "%0,00 EUR1.138,00 EUR".  The fragment keeps the
// original word as provenance; only its normalized numeric value is used for math.
const NUMERIC_FRAGMENT_RE = /\d+(?:[.,]\d+)*/g;

function numericFragments(word: CanonicalWord, anchor: CanonicalWord): NumericEvidence[] {
  if (word === anchor || hsCodeFromText(word.text) !== undefined) return [];
  const text = word.text.trim();
  if (!text) return [];
  const matches = text.match(NUMERIC_FRAGMENT_RE) ?? [];
  return matches
    .map(raw => ({ word, raw, value: parseNumber(raw) }))
    .filter((entry): entry is NumericEvidence => entry.value !== undefined && Number.isFinite(entry.value));
}

function numericEvidence(words: CanonicalWord[], anchor: CanonicalWord): NumericEvidence[] {
  return words.flatMap(word => numericFragments(word, anchor));
}

function quantityEvidence(entries: NumericEvidence[]): NumericEvidence[] {
  return entries.filter(entry => /^\d{1,7}$/.test(entry.raw) && entry.value > 0);
}

function moneyEvidence(entries: NumericEvidence[]): NumericEvidence[] {
  return entries.filter(entry => MONEY_RE.test(entry.raw) && entry.value > 0);
}

/**
 * Geometry is intentionally direction-agnostic: real invoices may place GTIP at the
 * far right, between price columns, or in a headerless column. Arithmetic is stronger
 * evidence than assuming price/amount must be to one particular side of GTIP.
 */
function findMathTriplet(words: CanonicalWord[], anchor: CanonicalWord): { quantity: CanonicalWord; unitPrice: CanonicalWord; amount: CanonicalWord; q: number; p: number; a: number } | undefined {
  const evidence = numericEvidence(words, anchor);
  const quantities = quantityEvidence(evidence);
  const decimals = moneyEvidence(evidence);
  let best: { quantity: CanonicalWord; unitPrice: CanonicalWord; amount: CanonicalWord; q: number; p: number; a: number; score: number } | undefined;

  for (const q of quantities) {
    for (let i = 0; i < decimals.length; i++) {
      for (let j = 0; j < decimals.length; j++) {
        if (i === j) continue;
        const p = decimals[i]!, a = decimals[j]!;
        // A single OCR word may contain several monetary fragments.  Distinct
        // fragments in that word are valid independent candidates; the arithmetic
        // relation decides which fragment is price/amount.
        if (p.word === a.word && p.raw === a.raw) continue;
        const tolerance = Math.max(0.05, Math.abs(a.value) * 0.001);
        const diff = Math.abs(q.value * p.value - a.value);
        if (diff > tolerance) continue;
        const orderingPenalty = p.word.bbox.x0 <= a.word.bbox.x0 ? 0 : 0.02;
        const compactness = Math.abs(centerY(q.word) - centerY(anchor)) + Math.abs(centerY(p.word) - centerY(anchor)) + Math.abs(centerY(a.word) - centerY(anchor));
        // Prefer actual quantity/price/amount columns over incidental numbers in
        // descriptions/addresses when multiple exact arithmetic identities exist.
        const sameWordPenalty = p.word === a.word ? 0.01 : 0;
        const score = diff + orderingPenalty + compactness + sameWordPenalty;
        if (!best || score < best.score) best = { quantity: q.word, unitPrice: p.word, amount: a.word, q: q.value, p: p.value, a: a.value, score };
      }
    }
  }
  if (!best) return undefined;
  const { score: _score, ...result } = best;
  return result;
}

/**
 * Header-independent invoice discovery from CanonicalDocument geometry.
 * V5 keeps the date/time hardening and partitions visual rows by neighbouring HS
 * anchors. This tolerates OCR baseline drift without widening a blind fixed y band.
 */
export function discoverGenericInvoiceFieldCandidates(canonicalDocument: CanonicalDocument, segmentId: string): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const anchors: Array<{ page: CanonicalPage; word: CanonicalWord; hsCode: string }> = [];

  for (const page of canonicalDocument.pages) for (const word of page.words) {
    const hsCode = hsCodeFromText(word.text);
    if (hsCode) anchors.push({ page, word, hsCode });
  }
  anchors.sort((a, b) => a.page.pageNumber - b.page.pageNumber || centerY(a.word) - centerY(b.word));

  anchors.forEach(({ page, word: anchor, hsCode }, rowIndex) => {
    const previousAnchor = rowIndex > 0 && anchors[rowIndex - 1]!.page.pageNumber === page.pageNumber
      ? anchors[rowIndex - 1]!.word
      : undefined;
    const nextAnchor = rowIndex + 1 < anchors.length && anchors[rowIndex + 1]!.page.pageNumber === page.pageNumber
      ? anchors[rowIndex + 1]!.word
      : undefined;
    const row = rowWords(page, anchor, previousAnchor, nextAnchor);
    const hsField = `goodsLines.${rowIndex}.hsCode`;
    fields[hsField] = [candidate(hsField, `${segmentId}:generic:line-${rowIndex + 1}:hsCode`, hsCode, segmentId, page, [anchor], 0.98)];
    const triplet = findMathTriplet(row, anchor);
    if (!triplet) return;
    for (const [name, sourceWord, value] of [["quantity", triplet.quantity, triplet.q], ["unitPrice", triplet.unitPrice, triplet.p], ["lineTotal", triplet.amount, triplet.a]] as const) {
      const field = `goodsLines.${rowIndex}.${name}`;
      fields[field] = [candidate(field, `${segmentId}:generic:line-${rowIndex + 1}:${name}`, value, segmentId, page, [sourceWord], 0.94)];
    }
  });
  return { version: "1", fields };
}
