import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { applyCurrentDeclarationLlmAssistAuthority } from "./applyDeclarationLlmAssistAuthority.js";
import { orchestrateDeclarationLlmAssist } from "./orchestrateDeclarationLlmAssist.js";
import { QwenOpenAiProvider } from "./qwenOpenAiProvider.js";

export type DeclarationLlmAssistLifecycleResult =
  | { status: "NOT_CONFIGURED" }
  | { status: "SKIPPED"; reason: "NO_CURRENT_ASSESSMENT" | "ASSESSMENT_READY" | "INVALID_CONFIGURATION" | "NO_GROUNDED_CONFLICT" }
  | { status: "ASSISTED"; assistRunId: string; reusedAssistRun: boolean; decision: "RESOLVED" | "REVIEW_REQUIRED"; authorityApplied: false }
  | { status: "AUTHORITY_APPLIED"; assistRunId: string; reusedAssistRun: boolean; decision: "RESOLVED"; authorityApplied: true; resolutionRunId: string; reusedResolutionRun: boolean; promotedFields: string[] };

/**
 * Foundation 8.5 worker/lifecycle bridge. LLM use is explicit opt-in on the
 * declaration. Even when the provider returns RESOLVED, candidate authority is
 * applied only when autoApplyResolvedAuthority is explicitly enabled, and then
 * exclusively through the Foundation 6 resolution/promotion boundary.
 */
export async function tryOrchestrateDeclarationLlmAssistAfterProcessing(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
}): Promise<DeclarationLlmAssistLifecycleResult> {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId }).lean();
  if (!declaration) throw new Error("Declaration not found in company scope.");
  const policy = declaration.idpLlmAssistPolicy;
  if (!policy?.enabled) return { status: "NOT_CONFIGURED" };

  const assisted = await orchestrateDeclarationLlmAssist({
    companyId: params.companyId,
    declarationId: params.declarationId,
    provider: new QwenOpenAiProvider()
  });
  if (assisted.status === "SKIPPED") return assisted;
  if (assisted.decision !== "RESOLVED" || !policy.autoApplyResolvedAuthority) {
    return { ...assisted, authorityApplied: false };
  }

  const applied = await applyCurrentDeclarationLlmAssistAuthority(params);
  return {
    ...assisted,
    status: "AUTHORITY_APPLIED",
    decision: "RESOLVED",
    authorityApplied: true,
    resolutionRunId: applied.resolutionRunId,
    reusedResolutionRun: applied.reusedResolutionRun,
    promotedFields: applied.promotion.promotedFields
  };
}
