import type { DocumentDoc } from "../../documents/document.model.js";
import { extractFromUploaded } from "../../extraction/extraction.service.js";
import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../domain/documentSegment.types.js";
import type { SegmentClassification } from "../domain/segmentClassification.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";
import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope,
  type SegmentCandidateResult
} from "../domain/candidateExtraction.types.js";
import { projectCanonicalDocumentToSegments } from "../projector/canonicalSegmentProjector.js";

type ExtractorContext = {
  file: DocumentDoc;
  canonicalDocument: CanonicalDocument;
  segment: DocumentSegment;
  classification: SegmentClassification;
};

type RegisteredExtractor = {
  name: string;
  extract(context: ExtractorContext): Promise<Record<string, unknown>>;
};

const registry = new Map<string, RegisteredExtractor>([
  [
    ClassifiedDocumentType.INVOICE,
    {
      name: "invoice-canonical-v1",
      async extract({ file, canonicalDocument, segment, classification }) {
        const projected = projectCanonicalDocumentToSegments(
          canonicalDocument,
          [segment],
          [classification],
          ClassifiedDocumentType.INVOICE
        );
        if (!projected) {
          throw new Error(`INVOICE segment projection failed: ${segment.segmentId}`);
        }
        const extracted = await extractFromUploaded(file, { canonicalDocument: projected });
        return extracted.data;
      }
    }
  ]
]);

export async function extractCandidatesBySegment(
  file: DocumentDoc,
  canonicalDocument: CanonicalDocument,
  segments: DocumentSegment[],
  classifications: SegmentClassification[]
): Promise<CandidateExtractionEnvelope> {
  const segmentById = new Map(segments.map((segment) => [segment.segmentId, segment]));
  const results: SegmentCandidateResult[] = [];

  for (const classification of classifications) {
    const segment = segmentById.get(classification.segmentId);
    if (!segment) {
      throw new Error(`Classification references missing segment: ${classification.segmentId}`);
    }

    if (classification.documentType === ClassifiedDocumentType.UNKNOWN) {
      results.push({
        segmentId: segment.segmentId,
        documentType: classification.documentType,
        status: CandidateExtractionStatus.SKIPPED,
        pageNumbers: [...segment.pageNumbers],
        reason: "unknown-document-type"
      });
      continue;
    }

    const extractor = registry.get(classification.documentType);
    if (!extractor) {
      results.push({
        segmentId: segment.segmentId,
        documentType: classification.documentType,
        status: CandidateExtractionStatus.UNSUPPORTED,
        pageNumbers: [...segment.pageNumbers],
        reason: "extractor-not-registered"
      });
      continue;
    }

    const data = await extractor.extract({ file, canonicalDocument, segment, classification });
    results.push({
      segmentId: segment.segmentId,
      documentType: classification.documentType,
      status: CandidateExtractionStatus.EXTRACTED,
      extractor: extractor.name,
      pageNumbers: [...segment.pageNumbers],
      data
    });
  }

  return { version: "1", segments: results };
}

export function getPrimaryInvoiceCandidate(
  envelope: CandidateExtractionEnvelope
): Record<string, unknown> | undefined {
  return envelope.segments.find(
    (result) =>
      result.documentType === ClassifiedDocumentType.INVOICE &&
      result.status === CandidateExtractionStatus.EXTRACTED
  )?.data;
}
