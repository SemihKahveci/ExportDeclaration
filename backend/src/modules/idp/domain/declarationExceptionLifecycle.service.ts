import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { assessDeclarationExceptions } from "./declarationExceptionAssessment.js";
import { persistDeclarationExceptionAssessment } from "./declarationExceptionAssessment.service.js";
import type { DeclarationExceptionPolicy } from "./declarationException.types.js";
import { DeclarationFieldResolutionRunModel } from "./declarationFieldResolution.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "./declarationIntelligenceAssessment.model.js";

export type DeclarationExceptionLifecycleResult =
  | { status: "NOT_READY"; reason: "NO_CURRENT_RESOLUTION" }
  | {
      status: "ASSESSED";
      exceptionStatus: "CLEAR" | "REVIEW_REQUIRED" | "BLOCKED";
      assessmentRunId: string;
      reused: boolean;
      exceptionCount: number;
    };

/**
 * Foundation 9.8 production lifecycle bridge.
 *
 * Resolution and intelligence are always loaded from the declaration's exact
 * current snapshots. Confidence is evaluated only when an explicit persisted
 * idpExceptionPolicy threshold exists. With no policy, deterministic unresolved
 * resolution/intelligence exceptions are still surfaced, but no confidence
 * threshold is invented.
 */
export async function tryAssessDeclarationExceptionsAfterProcessing(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
}): Promise<DeclarationExceptionLifecycleResult> {
  const declaration = await DeclarationModel.findOne({
    _id: params.declarationId,
    companyId: params.companyId,
  }).lean();
  if (!declaration) throw new Error("Declaration not found in company scope.");

  const resolutionRunId = declaration.idpResolution?.resolutionRunId;
  if (!resolutionRunId) return { status: "NOT_READY", reason: "NO_CURRENT_RESOLUTION" };

  const resolutionRun = await DeclarationFieldResolutionRunModel.findOne({
    _id: resolutionRunId,
    companyId: params.companyId,
    declarationId: params.declarationId,
  }).lean();
  if (!resolutionRun) throw new Error("Current declaration resolution run is missing or out of scope.");

  const intelligenceRunId = declaration.idpIntelligence?.assessmentRunId;
  const intelligenceRun = intelligenceRunId
    ? await DeclarationIntelligenceAssessmentRunModel.findOne({
        _id: intelligenceRunId,
        companyId: params.companyId,
        declarationId: params.declarationId,
      }).lean()
    : null;
  if (intelligenceRunId && !intelligenceRun) {
    throw new Error("Current declaration intelligence assessment is missing or out of scope.");
  }

  const persistedPolicy = declaration.idpExceptionPolicy as DeclarationExceptionPolicy | undefined;
  const policy: DeclarationExceptionPolicy = persistedPolicy
    ? { version: "1", minimumSelectedCandidateConfidence: persistedPolicy.minimumSelectedCandidateConfidence }
    : { version: "1" };

  const assessment = assessDeclarationExceptions({
    policy,
    resolution: resolutionRun.resolution,
    intelligence: intelligenceRun?.readiness,
  });

  const persisted = await persistDeclarationExceptionAssessment({
    companyId: params.companyId,
    declarationId: params.declarationId,
    sourceResolutionRunId: resolutionRun._id,
    sourceIntelligenceAssessmentRunId: intelligenceRun?._id,
    policy,
    assessment,
  });

  return {
    status: "ASSESSED",
    exceptionStatus: assessment.status,
    assessmentRunId: String(persisted.run._id),
    reused: persisted.reused,
    exceptionCount: assessment.exceptions.length,
  };
}
