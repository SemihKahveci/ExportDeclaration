import type { ClassifiedDocumentTypeValue } from "./segmentClassification.types.js";

export const CandidateResolutionStatus = {
  RESOLVED: "RESOLVED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;

export type CandidateResolutionStatusValue =
  (typeof CandidateResolutionStatus)[keyof typeof CandidateResolutionStatus];

export interface CandidateResolutionIssue {
  code: "NO_INVOICE_CANDIDATE" | "MULTIPLE_INVOICE_CANDIDATES";
  message: string;
  segmentIds: string[];
}

export interface CandidateResolutionEnvelope {
  version: "1";
  status: CandidateResolutionStatusValue;
  documentType: ClassifiedDocumentTypeValue | null;
  strategy: "SINGLE_CANDIDATE" | "MANUAL_REVIEW";
  sourceSegmentIds: string[];
  data?: Record<string, unknown>;
  issues: CandidateResolutionIssue[];
}
