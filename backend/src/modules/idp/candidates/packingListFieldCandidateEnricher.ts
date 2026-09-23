import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "packing-list-canonical-v1";

/**
 * Foundation 7.7 starts PACKING_LIST declaration evidence with one deliberately
 * narrow, evidence-backed field used for cross-document consistency: quantity.
 * No customs semantics or values are inferred when the explicit label is absent.
 */
export function buildPackingListFieldCandidates(
  canonicalDocument: CanonicalDocument,
  segmentId: string
): FieldCandidateEnvelope {
  const fields: FieldCandidateEnvelope["fields"] = {};

  for (const page of canonicalDocument.pages) {
    for (const line of page.lines) {
      const match = line.text.match(/\b(?:QTY|QUANTITY)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\b/i);
      if (!match) continue;
      const numeric = Number(match[1]!.replace(",", "."));
      if (!Number.isFinite(numeric)) continue;

      fields["goodsLines.0.quantity"] = [{
        candidateId: `${segmentId}:packing-list:quantity`,
        field: "goodsLines.0.quantity",
        value: numeric,
        confidence: 0.95,
        extractor: EXTRACTOR,
        evidence: [{
          segmentId,
          pageNumber: page.pageNumber,
          bbox: line.bbox,
          text: line.text,
          contentSource: line.source
        }]
      }];
      return { version: "1", fields };
    }
  }

  return { version: "1", fields };
}
