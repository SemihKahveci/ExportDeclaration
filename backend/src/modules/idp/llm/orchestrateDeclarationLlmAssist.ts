import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../domain/declarationIntelligenceAssessment.model.js";
import { DeclarationLlmAssistRunModel } from "../domain/declarationLlmAssistRun.model.js";
import { persistDeclarationLlmAssistRun } from "../domain/declarationLlmAssistRun.service.js";
import { buildDeclarationLlmAssistRequest, decideDeclarationLlmAssistPolicy, DeclarationLlmAssistPolicyDecision } from "./declarationLlmAssistPolicy.js";
import { resolveDeclarationConflictsWithLlm, type DeclarationLlmAssistProvider } from "./resolveDeclarationConflictsWithLlm.js";

export type DeclarationLlmAssistOrchestrationResult =
  | { status: "SKIPPED"; reason: "NO_CURRENT_ASSESSMENT" | "ASSESSMENT_READY" | "INVALID_CONFIGURATION" | "NO_GROUNDED_CONFLICT" }
  | { status: "ASSISTED"; assistRunId: string; reusedAssistRun: boolean; decision: "RESOLVED" | "REVIEW_REQUIRED" };

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  }
  return value;
}

function buildAssistKey(assessmentRunId: string, request: unknown, providerName: string): string {
  return createHash("sha256").update(JSON.stringify(stable({ version: "1", assessmentRunId, request, providerName }))).digest("hex");
}

/**
 * Foundation 8 production boundary. It may ask an explicitly supplied LLM
 * provider to choose among already persisted conflict candidates, then stores
 * that advice as append-only audit. It never promotes values or replaces the
 * Foundation 6 authority/resolution boundary.
 */
export async function orchestrateDeclarationLlmAssist(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  provider: DeclarationLlmAssistProvider;
}): Promise<DeclarationLlmAssistOrchestrationResult> {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId }).lean();
  if (!declaration) throw new Error("Declaration not found in company scope.");
  const assessmentRunId = declaration.idpIntelligence?.assessmentRunId;
  if (!assessmentRunId) return { status: "SKIPPED", reason: "NO_CURRENT_ASSESSMENT" };

  const assessment = await DeclarationIntelligenceAssessmentRunModel.findOne({
    _id: assessmentRunId,
    companyId: params.companyId,
    declarationId: params.declarationId
  }).lean();
  if (!assessment) return { status: "SKIPPED", reason: "NO_CURRENT_ASSESSMENT" };
  if (assessment.readiness.status === "READY") return { status: "SKIPPED", reason: "ASSESSMENT_READY" };
  if (assessment.readiness.status === "INVALID_CONFIGURATION") return { status: "SKIPPED", reason: "INVALID_CONFIGURATION" };

  const policy = decideDeclarationLlmAssistPolicy(assessment.consistency);
  if (policy !== DeclarationLlmAssistPolicyDecision.ALLOW_GROUNDED_CONFLICT) {
    return { status: "SKIPPED", reason: "NO_GROUNDED_CONFLICT" };
  }

  const request = buildDeclarationLlmAssistRequest({
    companyId: String(params.companyId),
    declarationId: String(params.declarationId),
    consistency: assessment.consistency
  });
  const assistKey = buildAssistKey(String(assessment._id), request, params.provider.name);

  const existing = await DeclarationLlmAssistRunModel.findOne({
    companyId: params.companyId,
    declarationId: params.declarationId,
    assistKey
  });
  if (existing) {
    if (String(declaration.idpLlmAssist?.assistRunId ?? "") !== String(existing._id)) {
      throw new Error("Stale Declaration LLM replay cannot replace the current assistance run.");
    }
    return { status: "ASSISTED", assistRunId: String(existing._id), reusedAssistRun: true, decision: existing.response.decision };
  }

  const response = await resolveDeclarationConflictsWithLlm({ request, provider: params.provider });
  const persisted = await persistDeclarationLlmAssistRun({
    companyId: params.companyId,
    declarationId: params.declarationId,
    assessmentRunId: assessment._id,
    request,
    response,
    assistKey
  });
  return {
    status: "ASSISTED",
    assistRunId: String(persisted.run._id),
    reusedAssistRun: persisted.reused,
    decision: persisted.run.response.decision
  };
}
