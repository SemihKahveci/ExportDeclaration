import { CandidateResolutionStatus, type CandidateResolutionEnvelope } from "../domain/candidateResolution.types.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * The legacy segment-level LLM resolver is advisory once declaration-facing
 * peer candidates have already been persisted. A resolver REVIEW_REQUIRED must
 * not prevent Foundation 6 from evaluating those Native/OCR/Vision candidates.
 *
 * Fail-closed behavior is preserved when the persisted envelope is missing or
 * empty. Foundation 6 remains the sole normalizedData authority.
 */
export function shouldDeferResolutionReviewToDeclarationAuthority(params: {
  resolution: CandidateResolutionEnvelope;
  declarationCandidates: unknown;
}): boolean {
  if (params.resolution.status === CandidateResolutionStatus.RESOLVED && params.resolution.data) return false;

  const envelope = asRecord(params.declarationCandidates);
  const fields = asRecord(envelope?.fields);
  if (!fields) return false;

  return Object.values(fields).some((value) => Array.isArray(value) && value.length > 0);
}
