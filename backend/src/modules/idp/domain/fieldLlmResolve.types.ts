import type { FieldCandidate } from "./fieldCandidate.types.js";

export const FieldLlmResolveDecision = {
  RESOLVED: "RESOLVED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;
export type FieldLlmResolveDecisionValue =
  (typeof FieldLlmResolveDecision)[keyof typeof FieldLlmResolveDecision];

export interface FieldLlmResolveRequestField {
  field: string;
  candidates: FieldCandidate[];
}

export interface FieldLlmResolveRequest {
  version: "1";
  task: "RESOLVE_FIELD_CANDIDATES";
  fields: FieldLlmResolveRequestField[];
}

export interface FieldLlmSelection {
  field: string;
  candidateId: string;
}

export interface FieldLlmResolveResponse {
  version: "1";
  decision: FieldLlmResolveDecisionValue;
  selections: FieldLlmSelection[];
  issues: Array<{ code: string; message: string }>;
  model: string;
  provider: string;
}

export interface FieldLlmProvider {
  readonly name: string;
  resolveFieldCandidates(request: FieldLlmResolveRequest): Promise<FieldLlmResolveResponse>;
}
