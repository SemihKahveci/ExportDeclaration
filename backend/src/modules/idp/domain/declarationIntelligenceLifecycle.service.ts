import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import type { DeclarationDocumentCoverageProfile } from "./declarationDocumentCoverage.types.js";
import type { DeclarationCrossDocumentConsistencyProfile } from "./declarationCrossDocumentConsistency.types.js";
import { loadDeclarationDocumentSet } from "./declarationDocumentSet.service.js";
import { orchestrateDeclarationIntelligence, type DeclarationIntelligenceOrchestrationResult } from "./declarationIntelligenceOrchestration.service.js";
import { ProcessingRunModel } from "./processingRun.model.js";

export type DeclarationIntelligenceLifecycleResult =
  | { status: "NOT_CONFIGURED" }
  | DeclarationIntelligenceOrchestrationResult;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Worker/lifecycle bridge for Foundation 7.6. Intelligence policy is persisted
 * on the declaration by an explicit caller. When no policy exists, the worker
 * skips intelligence assessment instead of inventing customs/document rules.
 */
export async function tryOrchestrateDeclarationIntelligenceAfterProcessing(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
}): Promise<DeclarationIntelligenceLifecycleResult> {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId }).lean();
  if (!declaration) throw new Error("Declaration not found in company scope.");

  const policy = declaration.idpIntelligencePolicy as
    | { version?: string; coverageProfile?: DeclarationDocumentCoverageProfile; consistencyProfile?: DeclarationCrossDocumentConsistencyProfile }
    | undefined;
  if (!policy?.coverageProfile || !policy?.consistencyProfile) return { status: "NOT_CONFIGURED" };

  const loaded = await loadDeclarationDocumentSet(params);
  const runIds = [...new Set(loaded.documentSet.documents.map((document) => document.sourceProcessingRunId).filter(Boolean))] as string[];
  const runs = runIds.length
    ? await ProcessingRunModel.find({ _id: { $in: runIds }, companyId: params.companyId, declarationId: params.declarationId })
        .select({ _id: 1, status: 1, declarationCandidates: 1 })
        .lean()
    : [];
  const runFingerprint = runs
    .map((run) => ({ id: String(run._id), status: run.status, declarationCandidates: run.declarationCandidates ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const assessmentKey = `worker-v1:${createHash("sha256")
    .update(stableJson({ policy, runFingerprint }))
    .digest("hex")}`;

  return orchestrateDeclarationIntelligence({
    companyId: params.companyId,
    declarationId: params.declarationId,
    coverageProfile: policy.coverageProfile,
    consistencyProfile: policy.consistencyProfile,
    assessmentKey
  });
}
