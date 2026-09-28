import { ValidationStatus, type ValidationEnvelope } from "../domain/validation.types.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * The legacy invoice validator validates the segment-level extraction shape.
 * Once declaration-facing F6 field candidates have been persisted, a legacy
 * validation failure must not prevent the declaration authority lifecycle from
 * seeing peer Native/OCR/Vision evidence. F6 remains the only authority that
 * can promote normalizedData.
 *
 * This is deliberately narrow: without a non-empty persisted FieldCandidate
 * envelope, REVIEW_REQUIRED still blocks the worker exactly as before.
 */
export function shouldDeferValidationReviewToDeclarationAuthority(params: {
  validation: ValidationEnvelope;
  declarationCandidates: unknown;
}): boolean {
  if (params.validation.status !== ValidationStatus.REVIEW_REQUIRED) return false;
  if (params.validation.validator !== "invoice-deterministic-v1") return false;

  const envelope = asRecord(params.declarationCandidates);
  const fields = asRecord(envelope?.fields);
  if (!fields) return false;

  return Object.values(fields).some((value) => Array.isArray(value) && value.length > 0);
}
