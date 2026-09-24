import { createHash } from "node:crypto";
import { DeclarationHumanReviewDecision, type DeclarationHumanReviewRequest, type DeclarationHumanReviewSubmission } from "../domain/declarationHumanReview.types.js";
import { validateDeclarationHumanReviewSubmission } from "./declarationHumanReviewContract.js";
import { DeclarationHumanReviewRunModel } from "./declarationHumanReviewRun.model.js";

function canonicalSubmission(submission: DeclarationHumanReviewSubmission) {
  return {
    version: submission.version,
    companyId: submission.companyId,
    declarationId: submission.declarationId,
    sourceResolutionRunId: submission.sourceResolutionRunId,
    actorUserId: submission.actorUserId,
    decisions: [...submission.decisions].sort((a, b) => a.field.localeCompare(b.field)).map((d) => ({
      field: d.field, decision: d.decision, candidateId: d.candidateId ?? null, note: d.note ?? null
    }))
  };
}

export function buildDeclarationHumanReviewKey(submission: DeclarationHumanReviewSubmission): string {
  return createHash("sha256").update(JSON.stringify(canonicalSubmission(submission))).digest("hex");
}

export async function persistDeclarationHumanReviewRun(input: {
  request: DeclarationHumanReviewRequest;
  submission: DeclarationHumanReviewSubmission;
  currentSourceResolutionRunId: string;
}) {
  if (input.request.sourceResolutionRunId !== input.currentSourceResolutionRunId) {
    throw new Error("Human review request is stale relative to the declaration current resolution run.");
  }
  const validated = validateDeclarationHumanReviewSubmission(input.request, input.submission);
  const reviewKey = buildDeclarationHumanReviewKey(validated);
  const existing = await DeclarationHumanReviewRunModel.findOne({
    companyId: validated.companyId, declarationId: validated.declarationId, reviewKey
  });
  if (existing) return { run: existing, reused: true };

  const status = validated.decisions.some((d) => d.decision === DeclarationHumanReviewDecision.KEEP_REVIEW_REQUIRED)
    ? "REVIEW_REQUIRED" : "DECIDED";
  try {
    const run = await DeclarationHumanReviewRunModel.create({ ...canonicalSubmission(validated), reviewKey, status });
    return { run, reused: false };
  } catch (error: any) {
    if (error?.code === 11000) {
      const run = await DeclarationHumanReviewRunModel.findOne({ companyId: validated.companyId, declarationId: validated.declarationId, reviewKey });
      if (run) return { run, reused: true };
    }
    throw error;
  }
}
