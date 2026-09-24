import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../domain/declarationFieldResolution.model.js";
import { resolveAndPersistDeclarationFields } from "../domain/declarationFieldResolution.service.js";
import type { DeclarationCandidateAuthoritySelection } from "../domain/declarationFieldResolution.types.js";
import { promotePersistedDeclarationFieldResolution } from "../domain/declarationFieldPromotion.service.js";
import { DeclarationHumanReviewDecision } from "../domain/declarationHumanReview.types.js";
import { DeclarationHumanReviewRunModel } from "./declarationHumanReviewRun.model.js";

function authorityKey(
  sourceResolutionRunId: string,
  reviewRunId: string,
  selections: DeclarationCandidateAuthoritySelection[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      version: "1",
      sourceResolutionRunId,
      reviewRunId,
      selections: selections.slice().sort((a, b) => a.field.localeCompare(b.field)),
    }))
    .digest("hex");
}

/**
 * Foundation 9.3 bridge. A persisted human review never writes normalizedData
 * directly. DECIDED candidate selections are converted to explicit authority
 * input and re-enter the existing Foundation 6 resolution/promotion boundary.
 */
export async function applyDeclarationHumanReviewAuthority(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  reviewRunId: mongoose.Types.ObjectId | string;
}) {
  const declaration = await DeclarationModel.findOne({
    _id: params.declarationId,
    companyId: params.companyId,
  });
  if (!declaration) throw new Error("Declaration not found in company scope.");

  const reviewRun = await DeclarationHumanReviewRunModel.findOne({
    _id: params.reviewRunId,
    companyId: String(params.companyId),
    declarationId: String(params.declarationId),
  }).lean();
  if (!reviewRun) throw new Error("Human review run not found in declaration/company scope.");
  if (reviewRun.status !== "DECIDED") {
    throw new Error("Only DECIDED human review may become candidate authority input.");
  }
  if (reviewRun.decisions.length === 0) throw new Error("DECIDED human review contains no decisions.");
  if (reviewRun.decisions.some((decision) => decision.decision !== DeclarationHumanReviewDecision.SELECT_CANDIDATE)) {
    throw new Error("Human authority application requires candidate selections for every reviewed field.");
  }

  const sourceResolutionRun = await DeclarationFieldResolutionRunModel.findOne({
    _id: reviewRun.sourceResolutionRunId,
    companyId: params.companyId,
    declarationId: params.declarationId,
  }).lean();
  if (!sourceResolutionRun) {
    throw new Error("Source Foundation 6 resolution run not found in declaration/company scope.");
  }

  const selections: DeclarationCandidateAuthoritySelection[] = reviewRun.decisions.map((decision) => {
    const fieldResolution = sourceResolutionRun.resolution.fields[decision.field];
    if (!fieldResolution) throw new Error(`Human review references field absent from source resolution: ${decision.field}.`);
    if (fieldResolution.status !== "REVIEW_REQUIRED") {
      throw new Error(`Human review may only resolve REVIEW_REQUIRED field: ${decision.field}.`);
    }
    if (!decision.candidateId || !fieldResolution.candidates.some((candidate) => candidate.candidateId === decision.candidateId)) {
      throw new Error(`Human review candidate ${decision.candidateId ?? "<missing>"} is absent from source resolution field ${decision.field}.`);
    }
    return { field: decision.field, candidateId: decision.candidateId, source: "HUMAN_REVIEW" };
  });

  const key = authorityKey(String(sourceResolutionRun._id), String(reviewRun._id), selections);
  const existingAuthorityRun = await DeclarationFieldResolutionRunModel.findOne({
    companyId: params.companyId,
    declarationId: params.declarationId,
    orchestrationKey: key,
  }).lean();

  // Exact replay is valid only while the already-derived authority run remains current.
  if (existingAuthorityRun) {
    if (String(declaration.idpResolution?.resolutionRunId ?? "") !== String(existingAuthorityRun._id)) {
      throw new Error("Stale human authority replay cannot replace the declaration's current resolution run.");
    }
    const persisted = await resolveAndPersistDeclarationFields({
      companyId: params.companyId,
      declarationId: params.declarationId,
      candidates: sourceResolutionRun.candidateEnvelope,
      rules: sourceResolutionRun.rules,
      candidateSelections: selections,
      orchestrationKey: key,
    });
    const promotion = await promotePersistedDeclarationFieldResolution({
      companyId: params.companyId,
      declarationId: params.declarationId,
      resolutionRunId: persisted.run._id,
    });
    return {
      sourceResolutionRunId: String(sourceResolutionRun._id),
      reviewRunId: String(reviewRun._id),
      resolutionRunId: String(persisted.run._id),
      reusedResolutionRun: persisted.reused,
      selections,
      resolution: persisted.resolution,
      promotion,
    };
  }

  if (String(declaration.idpResolution?.resolutionRunId ?? "") !== String(sourceResolutionRun._id)) {
    throw new Error("Human review is stale relative to the declaration current resolution run.");
  }

  const persisted = await resolveAndPersistDeclarationFields({
    companyId: params.companyId,
    declarationId: params.declarationId,
    candidates: sourceResolutionRun.candidateEnvelope,
    rules: sourceResolutionRun.rules,
    candidateSelections: selections,
    orchestrationKey: key,
  });
  const promotion = await promotePersistedDeclarationFieldResolution({
    companyId: params.companyId,
    declarationId: params.declarationId,
    resolutionRunId: persisted.run._id,
  });

  return {
    sourceResolutionRunId: String(sourceResolutionRun._id),
    reviewRunId: String(reviewRun._id),
    resolutionRunId: String(persisted.run._id),
    reusedResolutionRun: persisted.reused,
    selections,
    resolution: persisted.resolution,
    promotion,
  };
}
