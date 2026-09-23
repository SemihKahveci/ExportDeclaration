import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import type { DeclarationLlmAssistRequest, DeclarationLlmAssistResponse } from "./declarationLlmAssist.types.js";
import { DeclarationLlmAssistRunModel } from "./declarationLlmAssistRun.model.js";

export async function persistDeclarationLlmAssistRun(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  assessmentRunId: mongoose.Types.ObjectId;
  request: DeclarationLlmAssistRequest;
  response: DeclarationLlmAssistResponse;
  assistKey?: string;
}) {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId });
  if (!declaration) throw new Error("Declaration not found in company scope.");
  if (String(declaration.idpIntelligence?.assessmentRunId ?? "") !== String(params.assessmentRunId)) {
    throw new Error("Declaration LLM assistance requires the current intelligence assessment run.");
  }

  if (params.assistKey) {
    const existing = await DeclarationLlmAssistRunModel.findOne({
      companyId: params.companyId,
      declarationId: params.declarationId,
      assistKey: params.assistKey
    });
    if (existing) {
      if (String(declaration.idpLlmAssist?.assistRunId ?? "") !== String(existing._id)) {
        throw new Error("Stale Declaration LLM replay cannot replace the current assistance run.");
      }
      return { run: existing, reused: true as const };
    }
  }

  const run = await DeclarationLlmAssistRunModel.create({
    companyId: params.companyId,
    declarationId: params.declarationId,
    assessmentRunId: params.assessmentRunId,
    request: params.request,
    response: params.response,
    assistKey: params.assistKey
  });

  const updated = await DeclarationModel.updateOne(
    {
      _id: params.declarationId,
      companyId: params.companyId,
      "idpIntelligence.assessmentRunId": params.assessmentRunId
    },
    {
      $set: {
        idpLlmAssist: {
          version: "1",
          assistRunId: run._id,
          assessmentRunId: params.assessmentRunId,
          decision: params.response.decision,
          selections: params.response.selections,
          issues: params.response.issues,
          model: params.response.model,
          provider: params.response.provider,
          assistedAt: run.createdAt
        }
      }
    }
  );

  if (updated.matchedCount !== 1) {
    await DeclarationLlmAssistRunModel.deleteOne({ _id: run._id });
    throw new Error("Declaration intelligence assessment changed before LLM assistance could be persisted.");
  }

  return { run, reused: false as const };
}
