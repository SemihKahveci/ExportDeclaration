import { CandidateExtractionStatus, type CandidateExtractionEnvelope } from "../domain/candidateExtraction.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";

export const LlmResolvePolicyDecision = {
  SKIP_DETERMINISTIC_SINGLE: "SKIP_DETERMINISTIC_SINGLE",
  SKIP_NO_USABLE_CANDIDATE: "SKIP_NO_USABLE_CANDIDATE",
  ALLOW_AMBIGUOUS_CANDIDATES: "ALLOW_AMBIGUOUS_CANDIDATES"
} as const;

export function decideLlmResolvePolicy(envelope: CandidateExtractionEnvelope): string {
  const invoices = envelope.segments.filter((candidate) =>
    candidate.documentType === ClassifiedDocumentType.INVOICE &&
    candidate.status === CandidateExtractionStatus.EXTRACTED &&
    candidate.data
  );
  if (invoices.length === 1) return LlmResolvePolicyDecision.SKIP_DETERMINISTIC_SINGLE;
  if (invoices.length === 0) return LlmResolvePolicyDecision.SKIP_NO_USABLE_CANDIDATE;
  return LlmResolvePolicyDecision.ALLOW_AMBIGUOUS_CANDIDATES;
}
