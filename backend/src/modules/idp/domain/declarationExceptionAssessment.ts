import type {
  AssessDeclarationExceptionsParams,
  DeclarationException,
  DeclarationExceptionAssessment,
} from "./declarationException.types.js";

function validatePolicy(params: AssessDeclarationExceptionsParams): void {
  const threshold = params.policy.minimumSelectedCandidateConfidence;
  if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new Error("minimumSelectedCandidateConfidence must be between 0 and 1.");
  }
}

function pushUnique(target: DeclarationException[], item: DeclarationException): void {
  if (!target.some((existing) => existing.exceptionId === item.exceptionId)) target.push(item);
}

/**
 * Foundation 9.6 is assessment-only. It turns explicit deterministic state into
 * operational exceptions; it never selects a candidate and never mutates
 * normalizedData, sourceTrace, resolution, or intelligence state.
 */
export function assessDeclarationExceptions(
  params: AssessDeclarationExceptionsParams,
): DeclarationExceptionAssessment {
  validatePolicy(params);

  const exceptions: DeclarationException[] = [];

  for (const field of params.resolution.reviewRequiredFields) {
    pushUnique(exceptions, {
      exceptionId: `FIELD_REVIEW_REQUIRED:${field}`,
      reason: "FIELD_REVIEW_REQUIRED",
      severity: "REVIEW",
      field,
    });
  }

  const threshold = params.policy.minimumSelectedCandidateConfidence;
  if (threshold !== undefined) {
    for (const [field, result] of Object.entries(params.resolution.fields)) {
      const selected = result.selectedCandidate;
      if (!selected || result.status !== "RESOLVED") continue;
      if (selected.confidence < threshold) {
        pushUnique(exceptions, {
          exceptionId: `LOW_SELECTED_CANDIDATE_CONFIDENCE:${field}:${selected.candidateId}`,
          reason: "LOW_SELECTED_CANDIDATE_CONFIDENCE",
          severity: "REVIEW",
          field,
          candidateId: selected.candidateId,
          confidence: selected.confidence,
          threshold,
        });
      }
    }
  }

  if (params.intelligence?.status === "INVALID_CONFIGURATION") {
    pushUnique(exceptions, {
      exceptionId: "INVALID_INTELLIGENCE_CONFIGURATION",
      reason: "INVALID_INTELLIGENCE_CONFIGURATION",
      severity: "BLOCKING",
    });
  } else if (params.intelligence?.status === "REVIEW_REQUIRED") {
    pushUnique(exceptions, {
      exceptionId: "INTELLIGENCE_REVIEW_REQUIRED",
      reason: "INTELLIGENCE_REVIEW_REQUIRED",
      severity: "REVIEW",
    });
  }

  const status = exceptions.some((item) => item.severity === "BLOCKING")
    ? "BLOCKED"
    : exceptions.length > 0
      ? "REVIEW_REQUIRED"
      : "CLEAR";

  return {
    version: "1",
    companyId: params.resolution.companyId,
    declarationId: params.resolution.declarationId,
    status,
    exceptions,
  };
}
