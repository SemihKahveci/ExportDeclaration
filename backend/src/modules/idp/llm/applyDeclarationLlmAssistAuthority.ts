import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../domain/declarationFieldResolution.model.js";
import { resolveAndPersistDeclarationFields } from "../domain/declarationFieldResolution.service.js";
import type { DeclarationCandidateAuthoritySelection } from "../domain/declarationFieldResolution.types.js";
import { promotePersistedDeclarationFieldResolution } from "../domain/declarationFieldPromotion.service.js";
import { DeclarationLlmAssistRunModel } from "../domain/declarationLlmAssistRun.model.js";

function authorityKey(sourceResolutionRunId: string, assistRunId: string, selections: DeclarationCandidateAuthoritySelection[]): string {
  return createHash("sha256").update(JSON.stringify({ version: "1", sourceResolutionRunId, assistRunId, selections: selections.slice().sort((a, b) => a.field.localeCompare(b.field)) })).digest("hex");
}

/**
 * Foundation 8.4 bridge. Validated LLM advice never writes normalizedData
 * directly. It is converted into explicit candidate-level authority input and
 * handed back to the Foundation 6 resolver/persistence/promotion boundary.
 */
export async function applyCurrentDeclarationLlmAssistAuthority(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
}) {
  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId });
  if (!declaration) throw new Error("Declaration not found in company scope.");
  if (!declaration.idpLlmAssist) throw new Error("Declaration has no current LLM assistance snapshot.");
  if (declaration.idpLlmAssist.decision !== "RESOLVED") throw new Error("Only RESOLVED LLM assistance may become candidate authority input.");
  if (!declaration.idpResolution) throw new Error("Declaration has no current Foundation 6 resolution snapshot.");
  if (String(declaration.idpLlmAssist.assessmentRunId) !== String(declaration.idpIntelligence?.assessmentRunId ?? "")) {
    throw new Error("LLM assistance is stale relative to the current intelligence assessment.");
  }

  const assistRun = await DeclarationLlmAssistRunModel.findOne({
    _id: declaration.idpLlmAssist.assistRunId,
    companyId: params.companyId,
    declarationId: params.declarationId,
    assessmentRunId: declaration.idpLlmAssist.assessmentRunId
  }).lean();
  if (!assistRun) throw new Error("Current LLM assistance run not found in declaration/company scope.");

  const candidateSourceRuns = await DeclarationFieldResolutionRunModel.find({
    companyId: params.companyId,
    declarationId: params.declarationId,
    createdAt: { $lte: assistRun.createdAt }
  }).sort({ createdAt: -1 }).lean();
  const sourceResolutionRun = candidateSourceRuns.find((run) => assistRun.response.selections.every((selection) => {
    const fieldResolution = run.resolution.fields[selection.field];
    return fieldResolution?.status === "REVIEW_REQUIRED" && fieldResolution.candidates.some((candidate) => candidate.candidateId === selection.candidateId);
  }));
  if (!sourceResolutionRun) throw new Error("No Foundation 6 REVIEW_REQUIRED resolution run matches the current LLM assistance candidates.");

  const selections: DeclarationCandidateAuthoritySelection[] = assistRun.response.selections.map((selection) => {
    const fieldResolution = sourceResolutionRun.resolution.fields[selection.field];
    if (!fieldResolution) throw new Error(`LLM assistance references field absent from current resolution: ${selection.field}.`);
    if (fieldResolution.status !== "REVIEW_REQUIRED") throw new Error(`LLM assistance may only resolve REVIEW_REQUIRED field: ${selection.field}.`);
    if (!fieldResolution.candidates.some((candidate) => candidate.candidateId === selection.candidateId)) {
      throw new Error(`LLM assistance candidate ${selection.candidateId} is absent from current Foundation 6 resolution field ${selection.field}.`);
    }
    return { field: selection.field, candidateId: selection.candidateId, source: "LLM_ASSIST" };
  });
  if (selections.length === 0) throw new Error("RESOLVED LLM assistance contains no candidate selections.");

  const key = authorityKey(String(sourceResolutionRun._id), String(assistRun._id), selections);
  const persisted = await resolveAndPersistDeclarationFields({
    companyId: params.companyId,
    declarationId: params.declarationId,
    candidates: sourceResolutionRun.candidateEnvelope,
    rules: sourceResolutionRun.rules,
    candidateSelections: selections,
    orchestrationKey: key
  });
  const promotion = await promotePersistedDeclarationFieldResolution({
    companyId: params.companyId,
    declarationId: params.declarationId,
    resolutionRunId: persisted.run._id
  });

  return {
    sourceResolutionRunId: String(sourceResolutionRun._id),
    assistRunId: String(assistRun._id),
    resolutionRunId: String(persisted.run._id),
    reusedResolutionRun: persisted.reused,
    selections,
    resolution: persisted.resolution,
    promotion
  };
}
