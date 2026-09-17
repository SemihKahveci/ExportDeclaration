import type { ClassifiedDocumentTypeValue } from "./segmentClassification.types.js";

export const CandidateResolutionStatus = {
  RESOLVED: "RESOLVED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;

export type CandidateResolutionStatusValue =
  (typeof CandidateResolutionStatus)[keyof typeof CandidateResolutionStatus];

export type CandidateResolutionIssueCode =
  | "NO_INVOICE_CANDIDATE"
  | "MULTIPLE_INVOICE_CANDIDATES"
  | "LLM_RESOLUTION_FAILED"
  | "LLM_INVALID_SOURCE_SEGMENT"
  | "LLM_REVIEW_REQUIRED";

export interface CandidateResolutionIssue {
  code: CandidateResolutionIssueCode;
  message: string;
  segmentIds: string[];
}

export interface CandidateResolutionLlmAudit {
  provider: string;
  model: string;
}

export interface CandidateResolutionEnvelope {
  version: "1";
  status: CandidateResolutionStatusValue;
  documentType: ClassifiedDocumentTypeValue | null;
  strategy: "SINGLE_CANDIDATE" | "LLM" | "MANUAL_REVIEW";
  sourceSegmentIds: string[];
  data?: Record<string, unknown>;
  issues: CandidateResolutionIssue[];
  llmAudit?: CandidateResolutionLlmAudit;
}
