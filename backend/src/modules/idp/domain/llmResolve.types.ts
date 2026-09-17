import type { CandidateExtractionEnvelope } from "./candidateExtraction.types.js";

export const LlmResolveDecision = {
  RESOLVED: "RESOLVED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;
export type LlmResolveDecisionValue = (typeof LlmResolveDecision)[keyof typeof LlmResolveDecision];

export interface LlmResolveRequest {
  version: "1";
  task: "RESOLVE_INVOICE_CANDIDATES";
  candidates: CandidateExtractionEnvelope;
}

export interface LlmResolveResponse {
  version: "1";
  decision: LlmResolveDecisionValue;
  sourceSegmentIds: string[];
  data?: Record<string, unknown>;
  issues: Array<{ code: string; message: string }>;
  model: string;
  provider: string;
}

export interface LlmProvider {
  readonly name: string;
  resolveCandidates(request: LlmResolveRequest): Promise<LlmResolveResponse>;
}
