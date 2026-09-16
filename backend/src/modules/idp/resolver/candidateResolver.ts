import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope
} from "../domain/candidateExtraction.types.js";
import {
  CandidateResolutionStatus,
  type CandidateResolutionEnvelope
} from "../domain/candidateResolution.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";

/**
 * Deterministic resolver foundation.
 *
 * A single extracted INVOICE candidate is safe to promote automatically.
 * Multiple invoice candidates are deliberately NOT merged and the first one is
 * never selected silently. That case must be handled by a later multi-document
 * policy / human review (and not guessed by the resolver).
 */
export function resolveCandidates(
  envelope: CandidateExtractionEnvelope
): CandidateResolutionEnvelope {
  const invoiceCandidates = envelope.segments.filter(
    (candidate) =>
      candidate.documentType === ClassifiedDocumentType.INVOICE &&
      candidate.status === CandidateExtractionStatus.EXTRACTED &&
      candidate.data
  );

  if (invoiceCandidates.length === 0) {
    return {
      version: "1",
      status: CandidateResolutionStatus.REVIEW_REQUIRED,
      documentType: null,
      strategy: "MANUAL_REVIEW",
      sourceSegmentIds: [],
      issues: [
        {
          code: "NO_INVOICE_CANDIDATE",
          message: "Çözümlenebilir INVOICE candidate bulunamadı.",
          segmentIds: []
        }
      ]
    };
  }

  if (invoiceCandidates.length > 1) {
    const segmentIds = invoiceCandidates.map((candidate) => candidate.segmentId);
    return {
      version: "1",
      status: CandidateResolutionStatus.REVIEW_REQUIRED,
      documentType: ClassifiedDocumentType.INVOICE,
      strategy: "MANUAL_REVIEW",
      sourceSegmentIds: segmentIds,
      issues: [
        {
          code: "MULTIPLE_INVOICE_CANDIDATES",
          message: "Birden fazla INVOICE candidate bulundu; ilk candidate sessizce seçilmedi.",
          segmentIds
        }
      ]
    };
  }

  const candidate = invoiceCandidates[0]!;
  return {
    version: "1",
    status: CandidateResolutionStatus.RESOLVED,
    documentType: ClassifiedDocumentType.INVOICE,
    strategy: "SINGLE_CANDIDATE",
    sourceSegmentIds: [candidate.segmentId],
    data: candidate.data,
    issues: []
  };
}
