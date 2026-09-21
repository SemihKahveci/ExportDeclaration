import { apiGetJson, apiPostJson } from "./apiClient";

export type ReviewSource = "RESOLVE" | "VALIDATION" | "GENERIC_EVIDENCE";
export type EvidenceSource = "NATIVE_TEXT" | "OCR" | "DERIVED";
export type ReviewAction = "ACCEPT_CANDIDATE" | "OVERRIDE_VALUE" | "CONFIRM_VALUE";

export interface ReviewEvidence {
  segmentId: string;
  pageNumber: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  text?: string;
  contentSource: EvidenceSource;
}

export interface ReviewCandidate {
  candidateId: string;
  field: string;
  value: unknown;
  confidence: number;
  extractor: string;
  evidence: ReviewEvidence[];
  derived?: boolean;
}

export interface HumanReviewIssue {
  issueId: string;
  source: ReviewSource;
  code: string;
  message: string;
  field?: string;
  rowIndex?: number;
  lineNo?: number;
  candidateIds: string[];
  candidates: ReviewCandidate[];
  evidence: ReviewEvidence[];
}

export interface HumanReviewCase {
  version: "1";
  processingRunId: string;
  declarationId: string;
  uploadedFileId: string;
  processingStatus: string;
  stage: string;
  issues: HumanReviewIssue[];
  decisionCount: number;
  pendingIssueCount: number;
}

export interface HumanReviewDecision {
  _id: string;
  issueId: string;
  field?: string;
  rowIndex?: number;
  action: ReviewAction;
  candidateId?: string;
  value?: unknown;
  reason?: string;
  createdAt: string;
}

export function getLatestHumanReview(declarationId: string) {
  return apiGetJson<HumanReviewCase | null>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-reviews/latest`
  );
}

export function listHumanReviewDecisions(declarationId: string, runId: string) {
  return apiGetJson<HumanReviewDecision[]>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-reviews/${encodeURIComponent(runId)}/decisions`
  );
}

export function appendHumanReviewDecision(
  declarationId: string,
  runId: string,
  body: { issueId: string; action: ReviewAction; candidateId?: string; value?: unknown; reason?: string }
) {
  return apiPostJson<HumanReviewDecision>(
    `/api/declarations/${encodeURIComponent(declarationId)}/idp-reviews/${encodeURIComponent(runId)}/decisions`,
    body
  );
}
