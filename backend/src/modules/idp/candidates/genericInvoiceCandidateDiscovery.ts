import type { CanonicalBBox, CanonicalDocument, CanonicalPage, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-generic-layout-v15";
const MONEY_RE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,4})$/;
const INTEGER_RE = /^\d{1,7}$/;
const UNIT_ALIASES: Record<string, string> = {
  ADET: "Adet", ADE: "Adet", PCS: "PCS", PC: "PCS", EA: "EA",
  KG: "KG", KGS: "KG", SET: "SET", MT: "MT", M: "MT"
};
const STRUCTURAL_WORDS = new Set([
  "EUR", "USD", "TRY", "TL", "GBP", "FCA", "EXW", "FOB", "CIF", "CFR", "DAP", "DPU", "DDP", "CPT", "CIP",
  "KARAYOLU", "ROAD", "SEA", "AIR"
]);
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

/**
 * Semantic content does not necessarily share the HS/numeric baseline. Product
 * descriptions and secondary article codes commonly continue on visual lines
 * below the anchor line. Assign those continuation lines to the anchor that
 * starts them, stopping immediately before the next HS anchor. This is based on
 * document-local line height/anchor spacing only; it contains no supplier or
 * fixed-column coordinates.
 */
function semanticRowWords(
  page: CanonicalPage,
  anchor: CanonicalWord,
  previousAnchor?: CanonicalWord,
  nextAnchor?: CanonicalWord
): CanonicalWord[] {
  const anchorY = centerY(anchor);
  const local = page.words.filter(w => Math.abs(centerY(w) - anchorY) <= 0.06);
  const typicalHeight = median(local.map(height).filter(h => h > 0)) || height(anchor);
  const lineSlack = Math.max(0.0025, Math.min(0.012, typicalHeight * 0.65));

  const previousY = previousAnchor ? centerY(previousAnchor) : undefined;
  const nextY = nextAnchor ? centerY(nextAnchor) : undefined;
  const observedSpacing = nextY !== undefined
    ? nextY - anchorY
    : previousY !== undefined
      ? anchorY - previousY
      : Math.max(0.025, typicalHeight * 4);

  // Start at this anchor's visual line (with a small OCR baseline allowance),
  // never at the midpoint to the previous anchor. Continuation text appearing
  // after the previous anchor therefore stays with the previous logical row.
  const upper = anchorY - lineSlack;
  const lower = nextY !== undefined
    ? nextY - lineSlack
    : Math.min(1, anchorY + Math.max(0.018, observedSpacing - lineSlack));

  return page.words
    .filter(word => {
      const y = centerY(word);
      return y >= upper && y < lower;
    })
    .sort((a, b) => centerY(a) - centerY(b) || a.bbox.x0 - b.bbox.x0);
}

function normalizedToken(text: string): string {
  return text.trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
}

function unitFromText(text: string): string | undefined {
  const normalized = normalizedToken(text).replace(/[^A-Z]/g, "");
  return UNIT_ALIASES[normalized];
}

function overlaps(a: CanonicalWord, b: CanonicalWord): boolean {
  return a.bbox.x0 <= b.bbox.x1 && a.bbox.x1 >= b.bbox.x0 && a.bbox.y0 <= b.bbox.y1 && a.bbox.y1 >= b.bbox.y0;
}

function productCodeValues(text: string): string[] {
  const raw = text.trim();
  if (!raw || raw.length < 3 || raw.length > 64) return [];
  if (!/[A-Za-z]/.test(raw) || !/\d/.test(raw)) return [];
  if (/\s/.test(raw) || hsCodeFromText(raw) || DATE_TIME_RE.test(raw)) return [];
  // OCR frequently substitutes comma for dot in ERP/article namespaces.
  if (!/^[A-Za-z0-9,._\/-]+$/.test(raw)) return [];

  const values = [raw];
  // Preserve the observed token and expose progressively shorter namespace
  // suffixes as derived candidates. Examples:
  //   AG,EAT.216384 -> EAT.216384 -> 216384 (numeric-only suffix rejected)
  //   AG.SCH.C25B4  -> SCH.C25B4  -> C25B4
  // This is lexical decomposition, not a supplier-prefix rule.
  const separators = [...raw.matchAll(/[,._\/]/g)].map(match => match.index ?? -1).filter(index => index >= 0);
  for (const index of separators) {
    const suffix = raw.slice(index + 1);
    const alphaNumericSuffix = /[A-Za-z]/.test(suffix) && /\d/.test(suffix);
    const numericTerminalSuffix = /^\d{4,11}$/.test(suffix) && /[A-Za-z]/.test(raw.slice(0, index));
    if (suffix.length >= 3 && (alphaNumericSuffix || numericTerminalSuffix) && /^[A-Za-z0-9,._\/-]+$/.test(suffix)) {
      values.push(suffix);
    }
  }
  return [...new Set(values)];
}

function addCandidate(fields: Record<string, FieldCandidate[]>, field: string, value: unknown, candidateId: string, segmentId: string, page: CanonicalPage, words: CanonicalWord[], confidence: number, derived = false) {
  const item = candidate(field, candidateId, value, segmentId, page, words, confidence);
  if (derived) item.derived = true;
  (fields[field] ??= []).push(item);
}

function discoverSemanticFields(fields: Record<string, FieldCandidate[]>, rowIndex: number, row: CanonicalWord[], anchor: CanonicalWord, triplet: ReturnType<typeof findMathTriplet>, segmentId: string, page: CanonicalPage, productCodeRow: CanonicalWord[] = row) {
  if (!triplet) return;
  const quantity = triplet.quantity;
  const structured = new Set<CanonicalWord>([anchor, triplet.quantity, triplet.unitPrice, triplet.amount]);

  // Unit is a business vocabulary concept, not a layout coordinate. Prefer units
  // nearest the selected quantity but keep provenance from the actual token.
  const unitWords = row
    .map(word => ({ word, unit: unitFromText(word.text), distance: Math.abs(word.bbox.x0 - quantity.bbox.x1) }))
    .filter((entry): entry is { word: CanonicalWord; unit: string; distance: number } => Boolean(entry.unit))
    .sort((a, b) => a.distance - b.distance);
  if (unitWords[0]) {
    structured.add(unitWords[0].word);
    const field = `goodsLines.${rowIndex}.unit`;
    addCandidate(fields, field, unitWords[0].unit, `${segmentId}:generic:line-${rowIndex + 1}:unit`, segmentId, page, [unitWords[0].word], 0.96);
  }

  // Product codes are discovered by lexical shape, not a fixed column. Multiple
  // plausible representations are intentionally retained as candidates.
  const productSourceWords = [...new Set([...productCodeRow, ...row])];
  const productWords = productSourceWords
    // Do not assume the article-code column is left of quantity. Some invoice
    // layouts place it elsewhere and OCR/PDF extraction can shift baselines.
    // Structured numeric/HS/unit evidence is excluded first; lexical shape +
    // row geometry then decides the strongest source token.
    .filter(word => !structured.has(word) && !hsCodeFromText(word.text) && !unitFromText(word.text))
    .flatMap(word => productCodeValues(word.text).map((value, variant) => ({ word, value, variant })))
    .sort((a, b) => {
      // The anchor line is the logical row start. A code-like token on that line
      // is a stronger product-code candidate than a secondary/model code on a
      // continuation line, while all alternatives remain available to resolver.
      const aDy = Math.abs(centerY(a.word) - centerY(anchor));
      const bDy = Math.abs(centerY(b.word) - centerY(anchor));
      if (Math.abs(aDy - bDy) > 0.002) return aDy - bDy;
      const aScore = (/[.,_\/]/.test(a.word.text) ? 2 : 0) + (a.value.length >= 5 ? 1 : 0);
      const bScore = (/[.,_\/]/.test(b.word.text) ? 2 : 0) + (b.value.length >= 5 ? 1 : 0);
      return bScore - aScore || a.word.bbox.x0 - b.word.bbox.x0 || a.variant - b.variant;
    });
  const productField = `goodsLines.${rowIndex}.productCode`;
  const primaryProductCodeSourceWord = productWords[0]?.word;
  // A lexical namespace and its suffixes are one candidate family, not
  // independent competing product codes. Once the strongest source token is
  // selected, keep only variants derived from that same canonical evidence.
  // This prevents model/spec tokens such as ACTI9, 100A or 300MA-S from being
  // promoted to peer product-code candidates merely because they are alphanumeric.
  const primaryProductFamily = primaryProductCodeSourceWord
    ? productWords.filter(entry => entry.word === primaryProductCodeSourceWord)
    : [];
  primaryProductFamily.slice(0, 6).forEach((entry, index) => addCandidate(fields, productField, entry.value, `${segmentId}:generic:line-${rowIndex + 1}:productCode:${index + 1}`, segmentId, page, [entry.word], index === 0 ? 0.90 : 0.82, entry.value !== entry.word.text.trim()));

  // When a logical row has continuation lines, the item-description band is
  // revealed by words that continue below the product-code anchor. Anchor-line
  // values in other business columns (origin, delivery metadata, etc.) must not
  // leak into the description merely because they happen to be left of quantity.
  // This is geometry-derived per row: no country list, supplier prefix or fixed x.
  const anchorY = centerY(anchor);
  const continuationWords = row.filter(word => centerY(word) > anchorY + 0.0025 && word.bbox.x0 < quantity.bbox.x0);
  // A description continuation can be wider than the product-code token itself
  // (e.g. code on the first continuation line, model/spec words on later lines).
  // Do not clip that semantic band to the product-code token width: doing so
  // silently drops valid description tokens such as BASIC FRAME, 100-250 or 3P.
  // The quantity boundary remains document-local and structural/unit/HS tokens
  // are filtered below, so this is still header/supplier independent.
  const semanticContinuationWords = continuationWords;
  const hasSemanticContinuation = semanticContinuationWords.some(word =>
    /[A-Za-zÀ-žÇĞİÖŞÜçğıöşü]/.test(word.text) && !unitFromText(word.text)
  );

  // Description is the residual human-readable logical-row content before quantity.
  // Product/article codes are intentionally retained because commercial invoice
  // descriptions often include them as part of the human-readable item text.
  // Structural/business tokens and line numbers are removed without fixed columns.
  const descriptionWords = row.filter(word => {
    if (structured.has(word)) return false;
    if (word === primaryProductCodeSourceWord) return false;
    if (word.bbox.x0 >= quantity.bbox.x0) return false;
    if (hasSemanticContinuation) {
      const isContinuation = centerY(word) > anchorY + 0.0025;
      if (!isContinuation) return false;
      if (!semanticContinuationWords.includes(word)) return false;
    }
    const text = word.text.trim();
    if (!text || INTEGER_RE.test(text) || hsCodeFromText(text)) return false;
    const normalized = normalizedToken(text).replace(/[^A-Z]/g, "");
    if (STRUCTURAL_WORDS.has(normalized) || unitFromText(text)) return false;
    return /[A-Za-zÀ-žÇĞİÖŞÜçğıöşü]/.test(text);
  }).sort((a, b) => centerY(a) - centerY(b) || a.bbox.x0 - b.bbox.x0);
  if (descriptionWords.length) {
    const field = `goodsLines.${rowIndex}.description`;
    addCandidate(fields, field, descriptionWords.map(word => word.text.trim()).join(" ").replace(/\s+/g, " "), `${segmentId}:generic:line-${rowIndex + 1}:description`, segmentId, page, descriptionWords, 0.78);
  }
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

        // A quantity token is commonly followed by a unit token (PCS, Adet, KG,
        // etc.). This is semantic evidence, not a fixed-column assumption. It
        // also disambiguates cases where the line number happens to equal the
        // quantity (for example "4 ... 4 Adet ..."), which otherwise produces
        // the exact same arithmetic identity.
        const nearestUnitDistance = words
          .filter(word => unitFromText(word.text))
          .map(word => Math.abs(word.bbox.x0 - q.word.bbox.x1) + Math.abs(centerY(word) - centerY(q.word)))
          .reduce((best, distance) => Math.min(best, distance), Number.POSITIVE_INFINITY);
        const quantityUnitPenalty = Number.isFinite(nearestUnitDistance)
          ? Math.min(0.05, nearestUnitDistance)
          : 0.05;

        const score = diff + orderingPenalty + compactness + sameWordPenalty + quantityUnitPenalty;
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
    const semanticRow = semanticRowWords(page, anchor, previousAnchor, nextAnchor);
    const hsField = `goodsLines.${rowIndex}.hsCode`;
    fields[hsField] = [candidate(hsField, `${segmentId}:generic:line-${rowIndex + 1}:hsCode`, hsCode, segmentId, page, [anchor], 0.98)];
    const triplet = findMathTriplet(row, anchor);
    if (!triplet) return;
    for (const [name, sourceWord, value] of [["quantity", triplet.quantity, triplet.q], ["unitPrice", triplet.unitPrice, triplet.p], ["lineTotal", triplet.amount, triplet.a]] as const) {
      const field = `goodsLines.${rowIndex}.${name}`;
      fields[field] = [candidate(field, `${segmentId}:generic:line-${rowIndex + 1}:${name}`, value, segmentId, page, [sourceWord], 0.94)];
    }
    discoverSemanticFields(fields, rowIndex, semanticRow, anchor, triplet, segmentId, page, row);
  });
  return { version: "1", fields };
}
