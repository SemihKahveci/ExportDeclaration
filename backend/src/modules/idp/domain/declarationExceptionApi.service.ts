import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { DeclarationExceptionAssessmentRunModel } from "./declarationExceptionAssessment.model.js";

export async function getCurrentDeclarationExceptions(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new Error("Invalid declaration id.");
  const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId }).lean();
  if (!declaration) throw new Error("Declaration not found in company scope.");

  const snapshot = declaration.idpExceptions;
  if (!snapshot) return { available: false, current: null };

  const run = await DeclarationExceptionAssessmentRunModel.findOne({
    _id: snapshot.assessmentRunId,
    companyId,
    declarationId: declaration._id,
  }).lean();
  if (!run) throw new Error("Current exception assessment run is missing or out of scope.");

  return {
    available: true,
    current: {
      version: "1" as const,
      assessmentRunId: String(run._id),
      sourceResolutionRunId: String(run.sourceResolutionRunId),
      sourceIntelligenceAssessmentRunId: run.sourceIntelligenceAssessmentRunId
        ? String(run.sourceIntelligenceAssessmentRunId)
        : undefined,
      status: run.assessment.status,
      exceptions: run.assessment.exceptions,
      policy: run.policy,
      assessedAt: run.createdAt,
    },
  };
}

export async function listDeclarationExceptionAudit(companyId: mongoose.Types.ObjectId, declarationId: string) {
  if (!mongoose.isValidObjectId(declarationId)) throw new Error("Invalid declaration id.");
  const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId }).select("_id").lean();
  if (!declaration) throw new Error("Declaration not found in company scope.");

  const runs = await DeclarationExceptionAssessmentRunModel.find({
    companyId,
    declarationId: declaration._id,
  }).sort({ createdAt: -1 }).limit(50).lean();

  return runs.map((run) => ({
    assessmentRunId: String(run._id),
    sourceResolutionRunId: String(run.sourceResolutionRunId),
    sourceIntelligenceAssessmentRunId: run.sourceIntelligenceAssessmentRunId
      ? String(run.sourceIntelligenceAssessmentRunId)
      : undefined,
    status: run.assessment.status,
    exceptions: run.assessment.exceptions,
    policy: run.policy,
    assessedAt: run.createdAt,
  }));
}
