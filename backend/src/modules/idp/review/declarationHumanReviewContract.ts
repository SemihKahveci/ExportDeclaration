import type { DeclarationFieldResolutionEnvelope } from "../domain/declarationFieldResolution.types.js";
import {
  DeclarationHumanReviewDecision,
  type DeclarationHumanReviewRequest,
  type DeclarationHumanReviewSubmission
} from "../domain/declarationHumanReview.types.js";

/**
 * Foundation 9.1 human-review boundary.
 * Reviewers may only select candidate IDs already present in a Foundation 6
 * REVIEW_REQUIRED resolution, or explicitly leave that field unresolved.
 * No arbitrary replacement value enters this contract.
 */
export function buildDeclarationHumanReviewRequest(input: {
  sourceResolutionRunId: string;
  resolution: DeclarationFieldResolutionEnvelope;
}): DeclarationHumanReviewRequest {
  if (!input.sourceResolutionRunId.trim()) throw new Error("Human review requires a source resolution run id.");

  const fields = input.resolution.reviewRequiredFields.map((field) => {
    const resolvedField = input.resolution.fields[field];
    if (!resolvedField || resolvedField.status !== "REVIEW_REQUIRED") {
      throw new Error(`Human review field ${field} is not REVIEW_REQUIRED in the source resolution.`);
    }
    if (!resolvedField.candidates.length) throw new Error(`Human review field ${field} has no grounded candidates.`);
    return {
      field,
      candidates: resolvedField.candidates.map((candidate) => ({ ...candidate }))
    };
  });

  if (!fields.length) throw new Error("Human review request requires at least one REVIEW_REQUIRED field.");

  return {
    version: "1",
    companyId: input.resolution.companyId,
    declarationId: input.resolution.declarationId,
    sourceResolutionRunId: input.sourceResolutionRunId,
    fields
  };
}

export function validateDeclarationHumanReviewSubmission(
  request: DeclarationHumanReviewRequest,
  submission: DeclarationHumanReviewSubmission
): DeclarationHumanReviewSubmission {
  if (submission.version !== "1") throw new Error("Human review submission version is invalid.");
  if (submission.companyId !== request.companyId || submission.declarationId !== request.declarationId) {
    throw new Error("Human review submission scope mismatch.");
  }
  if (submission.sourceResolutionRunId !== request.sourceResolutionRunId) {
    throw new Error("Human review submission is stale relative to its source resolution run.");
  }
  if (!submission.actorUserId.trim()) throw new Error("Human review submission requires an actor user id.");
  if (!Array.isArray(submission.decisions) || submission.decisions.length !== request.fields.length) {
    throw new Error("Human review must explicitly decide every requested field.");
  }

  const seen = new Set<string>();
  for (const decision of submission.decisions) {
    if (seen.has(decision.field)) throw new Error(`Duplicate human review decision for ${decision.field}.`);
    seen.add(decision.field);
    const field = request.fields.find((item) => item.field === decision.field);
    if (!field) throw new Error(`Human review submitted an unrequested field: ${decision.field}.`);

    if (decision.decision === DeclarationHumanReviewDecision.SELECT_CANDIDATE) {
      if (!decision.candidateId || !field.candidates.some((candidate) => candidate.candidateId === decision.candidateId)) {
        throw new Error(`Human review selected an unknown candidateId for ${decision.field}.`);
      }
    } else if (decision.decision === DeclarationHumanReviewDecision.KEEP_REVIEW_REQUIRED) {
      if (decision.candidateId !== undefined) throw new Error("KEEP_REVIEW_REQUIRED cannot contain a candidate selection.");
    } else {
      throw new Error(`Human review decision is invalid for ${decision.field}.`);
    }
  }

  return submission;
}
