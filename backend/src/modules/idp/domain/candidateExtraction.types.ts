import type { ClassifiedDocumentTypeValue } from "./segmentClassification.types.js";

export const CandidateExtractionStatus = {
  EXTRACTED: "EXTRACTED",
  SKIPPED: "SKIPPED",
  UNSUPPORTED: "UNSUPPORTED"
} as const;

export type CandidateExtractionStatusValue =
  (typeof CandidateExtractionStatus)[keyof typeof CandidateExtractionStatus];

export interface SegmentCandidateResult {
  segmentId: string;
  documentType: ClassifiedDocumentTypeValue;
  status: CandidateExtractionStatusValue;
  extractor?: string;
  pageNumbers: number[];
  data?: Record<string, unknown>;
  reason?: string;
}

export interface CandidateExtractionEnvelope {
  version: "1";
  segments: SegmentCandidateResult[];
}
