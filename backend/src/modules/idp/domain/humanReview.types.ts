import type { FieldCandidate, FieldCandidateEvidence } from "./fieldCandidate.types.js";

export const HumanReviewDecisionAction = {
  ACCEPT_CANDIDATE: "ACCEPT_CANDIDATE",
  OVERRIDE_VALUE: "OVERRIDE_VALUE",
  CONFIRM_VALUE: "CONFIRM_VALUE"
} as const;
export type HumanReviewDecisionActionValue = typeof HumanReviewDecisionAction[keyof typeof HumanReviewDecisionAction];

export interface HumanReviewIssue {
  issueId: string;
  source: "RESOLVE" | "VALIDATION" | "GENERIC_EVIDENCE";
  code: string;
  message: string;
  field?: string;
  rowIndex?: number;
  lineNo?: number;
  candidateIds: string[];
  candidates: FieldCandidate[];
  evidence: FieldCandidateEvidence[];
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
