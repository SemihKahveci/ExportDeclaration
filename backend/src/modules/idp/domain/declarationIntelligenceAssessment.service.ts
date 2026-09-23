import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import type { DeclarationCrossDocumentConsistencyResult } from "./declarationCrossDocumentConsistency.types.js";
import type { DeclarationDocumentCoverageResult } from "./declarationDocumentCoverage.types.js";
import { DeclarationIntelligenceAssessmentRunModel } from "./declarationIntelligenceAssessment.model.js";
import { assessDeclarationIntelligenceReadiness } from "./declarationIntelligenceReadiness.js";

/**
 * Persists an append-only audit record for an already evaluated declaration
 * coverage + consistency pair, then points the declaration at the current
 * intelligence snapshot. It does not invent policy, choose authority, or
 * mutate normalized declaration data.
 */
export async function persistDeclarationIntelligenceAssessment(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  coverage: DeclarationDocumentCoverageResult;
  consistency: DeclarationCrossDocumentConsistencyResult;
  assessmentKey?: string;
}) {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId });
  if (!declaration) throw new Error("Declaration not found in company scope.");

  if (params.assessmentKey) {
    const existingRun = await DeclarationIntelligenceAssessmentRunModel.findOne({
      companyId: params.companyId,
      declarationId: params.declarationId,
      assessmentKey: params.assessmentKey
    });
    if (existingRun) {
      if (String(declaration.idpIntelligence?.assessmentRunId ?? "") !== String(existingRun._id)) {
        throw new Error("Stale intelligence replay cannot replace the declaration's current assessment run.");
      }
      return { run: existingRun, readiness: existingRun.readiness, reused: true as const };
    }
  }

  const readiness = assessDeclarationIntelligenceReadiness(params.coverage, params.consistency);
  const run = await DeclarationIntelligenceAssessmentRunModel.create({
    companyId: params.companyId,
    declarationId: params.declarationId,
    coverage: params.coverage,
    consistency: params.consistency,
    readiness,
    assessmentKey: params.assessmentKey
  });

  const updated = await DeclarationModel.updateOne(
    { _id: params.declarationId, companyId: params.companyId },
    {
      $set: {
        idpIntelligence: {
          version: "1",
          assessmentRunId: run._id,
          status: readiness.status,
          issues: readiness.issues,
          assessedAt: run.createdAt
        }
      }
    }
  );

  if (updated.matchedCount !== 1) {
    await DeclarationIntelligenceAssessmentRunModel.deleteOne({ _id: run._id });
    throw new Error("Declaration disappeared before intelligence snapshot could be persisted.");
  }

  return { run, readiness, reused: false as const };
}
