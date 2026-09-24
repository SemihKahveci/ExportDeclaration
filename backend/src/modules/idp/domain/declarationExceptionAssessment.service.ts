import crypto from "node:crypto";
import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import type { DeclarationExceptionAssessment, DeclarationExceptionPolicy } from "./declarationException.types.js";
import { DeclarationExceptionAssessmentRunModel } from "./declarationExceptionAssessment.model.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function buildDeclarationExceptionAssessmentKey(params: {
  sourceResolutionRunId: string;
  sourceIntelligenceAssessmentRunId?: string;
  policy: DeclarationExceptionPolicy;
  assessment: DeclarationExceptionAssessment;
}): string {
  return crypto.createHash("sha256").update(JSON.stringify(canonical({
    version: "1",
    sourceResolutionRunId: params.sourceResolutionRunId,
    sourceIntelligenceAssessmentRunId: params.sourceIntelligenceAssessmentRunId ?? null,
    policy: params.policy,
    assessment: params.assessment,
  }))).digest("hex");
}

/**
 * Persists an immutable exception assessment and advances only the declaration's
 * current exception snapshot. It does not select authority and does not write
 * normalizedData/sourceTrace.
 */
export async function persistDeclarationExceptionAssessment(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  sourceResolutionRunId: mongoose.Types.ObjectId;
  sourceIntelligenceAssessmentRunId?: mongoose.Types.ObjectId;
  policy: DeclarationExceptionPolicy;
  assessment: DeclarationExceptionAssessment;
}) {
  const companyId = String(params.companyId);
  const declarationId = String(params.declarationId);

  if (params.assessment.companyId !== companyId || params.assessment.declarationId !== declarationId) {
    throw new Error("Exception assessment scope does not match persistence scope.");
  }

  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId });
  if (!declaration) throw new Error("Declaration not found in company scope.");

  if (String(declaration.idpResolution?.resolutionRunId ?? "") !== String(params.sourceResolutionRunId)) {
    throw new Error("Stale exception assessment source resolution.");
  }

  const currentIntelligenceId = declaration.idpIntelligence?.assessmentRunId;
  if (params.sourceIntelligenceAssessmentRunId) {
    if (String(currentIntelligenceId ?? "") !== String(params.sourceIntelligenceAssessmentRunId)) {
      throw new Error("Stale exception assessment source intelligence.");
    }
  } else if (currentIntelligenceId) {
    throw new Error("Current intelligence exists but was omitted from exception assessment source.");
  }

  const assessmentKey = buildDeclarationExceptionAssessmentKey({
    sourceResolutionRunId: String(params.sourceResolutionRunId),
    sourceIntelligenceAssessmentRunId: params.sourceIntelligenceAssessmentRunId
      ? String(params.sourceIntelligenceAssessmentRunId)
      : undefined,
    policy: params.policy,
    assessment: params.assessment,
  });

  const existing = await DeclarationExceptionAssessmentRunModel.findOne({
    companyId: params.companyId,
    declarationId: params.declarationId,
    assessmentKey,
  });

  if (existing) {
    if (String(declaration.idpExceptions?.assessmentRunId ?? "") !== String(existing._id)) {
      throw new Error("Stale exception assessment replay cannot replace the current exception snapshot.");
    }
    return { run: existing, reused: true as const };
  }

  const run = await DeclarationExceptionAssessmentRunModel.create({
    companyId: params.companyId,
    declarationId: params.declarationId,
    sourceResolutionRunId: params.sourceResolutionRunId,
    sourceIntelligenceAssessmentRunId: params.sourceIntelligenceAssessmentRunId,
    policy: params.policy,
    assessment: params.assessment,
    assessmentKey,
  });

  const updated = await DeclarationModel.updateOne(
    {
      _id: params.declarationId,
      companyId: params.companyId,
      "idpResolution.resolutionRunId": params.sourceResolutionRunId,
      ...(params.sourceIntelligenceAssessmentRunId
        ? { "idpIntelligence.assessmentRunId": params.sourceIntelligenceAssessmentRunId }
        : { "idpIntelligence.assessmentRunId": { $exists: false } }),
    },
    {
      $set: {
        idpExceptions: {
          version: "1",
          assessmentRunId: run._id,
          sourceResolutionRunId: params.sourceResolutionRunId,
          sourceIntelligenceAssessmentRunId: params.sourceIntelligenceAssessmentRunId,
          status: params.assessment.status,
          exceptions: params.assessment.exceptions,
          assessedAt: run.createdAt,
        },
      },
    },
  );

  if (updated.matchedCount !== 1) {
    await DeclarationExceptionAssessmentRunModel.deleteOne({ _id: run._id });
    throw new Error("Declaration source state changed before exception snapshot could be persisted.");
  }

  return { run, reused: false as const };
}
