import type { CanonicalDocument, CanonicalPage, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  findMathTriplet,
  hsCodeFromText,
  rowWords,
  unitFromText,
} from "./genericInvoiceCandidateDiscovery.js";

const EXTRACTOR = "invoice-scanned-ocr-absent-fill-v1";
const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;

function firstCandidate(
  fields: FieldCandidateEnvelope["fields"],
  field: string,
): FieldCandidate | undefined {
  const values = fields[field] ?? [];
  return values
    .slice()
    .sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
}

function goodsRowIndexes(fields: FieldCandidateEnvelope["fields"]): number[] {
  return [...new Set(
    Object.keys(fields)
      .map((field) => ROW_FIELD_RE.exec(field)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number),
  )].sort((a, b) => a - b);
}

function pageEligible(page: CanonicalPage): boolean {
  if (page.contentKind === "SCANNED") return true;
  if (page.contentKind === "MIXED" && page.words.some((word) => word.source === "OCR")) return true;
  return false;
}

function documentHasScannedSurface(canonical: CanonicalDocument): boolean {
  return canonical.pages.some((page) => pageEligible(page));
}

function centerY(word: CanonicalWord): number {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function ocrHsAnchors(page: CanonicalPage): Array<{ word: CanonicalWord; hsCode: string }> {
  const anchors: Array<{ word: CanonicalWord; hsCode: string }> = [];
  for (const word of page.words) {
    if (word.source !== "OCR") continue;
    const hsCode = hsCodeFromText(word.text);
    if (!hsCode) continue;
    anchors.push({ word, hsCode });
  }
  anchors.sort((a, b) => centerY(a.word) - centerY(b.word) || a.word.bbox.x0 - b.word.bbox.x0);
  return anchors;
}

function locateUniqueOcrHs(
  canonical: CanonicalDocument,
  hsValue: unknown,
): { page: CanonicalPage; word: CanonicalWord; previous?: CanonicalWord; next?: CanonicalWord; hsCode: string } | undefined {
  const wanted = hsCodeFromText(String(hsValue ?? ""));
  if (!wanted) return undefined;
  const hits: Array<{ page: CanonicalPage; index: number; anchors: Array<{ word: CanonicalWord; hsCode: string }> }> = [];
  for (const page of canonical.pages) {
    if (!pageEligible(page)) continue;
    const anchors = ocrHsAnchors(page);
    for (let index = 0; index < anchors.length; index += 1) {
      if (anchors[index]!.hsCode !== wanted) continue;
      hits.push({ page, index, anchors });
    }
  }
  if (hits.length !== 1) return undefined;
  const hit = hits[0]!;
  return {
    page: hit.page,
    word: hit.anchors[hit.index]!.word,
    previous: hit.anchors[hit.index - 1]?.word,
    next: hit.anchors[hit.index + 1]?.word,
    hsCode: wanted,
  };
}

function emit(
  fields: Record<string, FieldCandidate[]>,
  segmentId: string,
  rowIndex: number,
  name: string,
  value: unknown,
  word: CanonicalWord,
  page: CanonicalPage,
): void {
  const field = `goodsLines.${rowIndex}.${name}`;
  if (fields[field]?.length) return;
  fields[field] = [{
    candidateId: `${segmentId}:ocr-absent-fill:line-${rowIndex + 1}:${name}`,
    field,
    value,
    confidence: 0.93,
    extractor: EXTRACTOR,
    evidence: [{
      segmentId,
      pageNumber: page.pageNumber,
      bbox: word.bbox,
      text: word.text,
      contentSource: "OCR",
    }],
  }];
}

/**
 * SCANNED/MIXED only: given Vision goods rows, fill empty numeric/unit cells
 * from the OCR row band around the matching HS token. Never invents rows,
 * never overwrites Vision, DIGITAL documents hard no-op.
 */
export function discoverValidatedOcrGoodsAbsentFill(
  canonical: CanonicalDocument,
  segmentId: string,
  visionGoodsCandidates: FieldCandidateEnvelope,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  if (!documentHasScannedSurface(canonical)) return { version: "1", fields };

  for (const rowIndex of goodsRowIndexes(visionGoodsCandidates.fields)) {
    const hs = firstCandidate(visionGoodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`);
    if (!hs) continue;
    const needsQuantity = !visionGoodsCandidates.fields[`goodsLines.${rowIndex}.quantity`]?.length;
    const needsUnitPrice = !visionGoodsCandidates.fields[`goodsLines.${rowIndex}.unitPrice`]?.length;
    const needsLineTotal = !visionGoodsCandidates.fields[`goodsLines.${rowIndex}.lineTotal`]?.length;
    const needsUnit = !visionGoodsCandidates.fields[`goodsLines.${rowIndex}.unit`]?.length;
    if (!needsQuantity && !needsUnitPrice && !needsLineTotal && !needsUnit) continue;

    const located = locateUniqueOcrHs(canonical, hs.value);
    if (!located) continue;
    const band = rowWords(located.page, located.word, located.previous, located.next)
      .filter((word) => word.source === "OCR");
    if (!band.length) continue;

    const triplet = findMathTriplet(band, located.word);
    if (triplet) {
      if (needsQuantity) emit(fields, segmentId, rowIndex, "quantity", triplet.q, triplet.quantity, located.page);
      if (needsUnitPrice) emit(fields, segmentId, rowIndex, "unitPrice", triplet.p, triplet.unitPrice, located.page);
      if (needsLineTotal) emit(fields, segmentId, rowIndex, "lineTotal", triplet.a, triplet.amount, located.page);
      if (needsUnit) {
        const unitWord = band.find((word) => unitFromText(word.text));
        const unit = unitWord ? unitFromText(unitWord.text) : undefined;
        if (unitWord && unit) emit(fields, segmentId, rowIndex, "unit", unit, unitWord, located.page);
      }
    }
  }

  return { version: "1", fields };
}
