import type { CanonicalDocument, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

const QUANTITY_FIELD_RE = /^goodsLines\.(\d+)\.quantity$/;
const UNIT_ALIASES: Record<string, string> = {
  ADET: "ADET", ADE: "ADET", PCS: "PCS", PC: "PCS", EA: "EA",
  KG: "KG", KGS: "KG", SET: "SET", MT: "MT", M: "MT"
};

function normalizedToken(text: string): string {
  return text.trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/[^A-Z]/g, "");
}

function unitFromWord(word: CanonicalWord): string | undefined {
  return UNIT_ALIASES[normalizedToken(word.text)];
}

function parseDocumentNumber(text: string): number | undefined {
  const raw = text.trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!raw) return undefined;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    const decimals = raw.length - comma - 1;
    normalized = decimals === 3 ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (dot >= 0) {
    const decimals = raw.length - dot - 1;
    normalized = decimals === 3 ? raw.replace(/\./g, "") : raw;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function centerY(word: CanonicalWord): number { return (word.bbox.y0 + word.bbox.y1) / 2; }
function height(word: CanonicalWord): number { return Math.max(0.001, word.bbox.y1 - word.bbox.y0); }

function sameVisualRow(left: CanonicalWord, right: CanonicalWord): boolean {
  return Math.abs(centerY(left) - centerY(right)) <= Math.max(0.004, height(left) * 0.8, height(right) * 0.8);
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9);
}

/**
 * Recover an explicit goods unit from canonical source geometry when a fused
 * goods quantity is already known. The quantity value is the association key;
 * the source must contain the same numeric token immediately followed by a
 * recognized unit on the same visual row. Ambiguous differing units are kept
 * as peer candidates so Foundation 6 can fail closed rather than guessing.
 */
export function associateExplicitGoodsUnitsFromQuantity(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  candidates: FieldCandidateEnvelope;
}): FieldCandidateEnvelope {
  const additions: Record<string, FieldCandidate[]> = {};

  for (const [field, quantityCandidates] of Object.entries(params.candidates.fields)) {
    const match = QUANTITY_FIELD_RE.exec(field);
    if (!match) continue;
    const rowIndex = match[1]!;
    const unitField = `goodsLines.${rowIndex}.unit`;
    if ((params.candidates.fields[unitField] ?? []).length > 0) continue;

    const quantityValues = [...new Set(quantityCandidates
      .map(candidate => typeof candidate.value === "number" ? candidate.value : Number(candidate.value))
      .filter(value => Number.isFinite(value)))];
    if (!quantityValues.length) continue;

    for (const page of params.canonicalDocument.pages) {
      const words = [...page.words].sort((a, b) => centerY(a) - centerY(b) || a.bbox.x0 - b.bbox.x0);
      for (const quantityWord of words) {
        const observed = parseDocumentNumber(quantityWord.text);
        if (observed === undefined || !quantityValues.some(value => approximatelyEqual(value, observed))) continue;

        const unitMatches = words
          .filter(word => word !== quantityWord && word.bbox.x0 >= quantityWord.bbox.x1 && sameVisualRow(quantityWord, word))
          .map(word => ({ word, unit: unitFromWord(word), gap: word.bbox.x0 - quantityWord.bbox.x1 }))
          .filter((entry): entry is { word: CanonicalWord; unit: string; gap: number } => Boolean(entry.unit) && entry.gap <= 0.045)
          .sort((a, b) => a.gap - b.gap);
        const nearest = unitMatches[0];
        if (!nearest) continue;

        const source = quantityWord.source === "OCR" || nearest.word.source === "OCR" ? "OCR" : "NATIVE_TEXT";
        (additions[unitField] ??= []).push({
          candidateId: `${params.segmentId}:quantity-unit:${rowIndex}:p${page.pageNumber}:${quantityWord.bbox.x0.toFixed(5)}:${nearest.word.bbox.x0.toFixed(5)}`,
          field: unitField,
          value: nearest.unit,
          confidence: 0.97,
          extractor: "invoice-quantity-unit-geometry-v1",
          evidence: [{
            segmentId: params.segmentId,
            pageNumber: page.pageNumber,
            bbox: nearest.word.bbox,
            text: nearest.word.text,
            contentSource: source
          }]
        });
      }
    }
  }

  if (!Object.keys(additions).length) return params.candidates;
  const fields = { ...params.candidates.fields };
  for (const [field, candidates] of Object.entries(additions)) fields[field] = [...(fields[field] ?? []), ...candidates];
  return { version: "1", fields };
}
