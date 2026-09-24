import mongoose from "mongoose";
import { HttpError } from "../../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../domain/declarationFieldResolution.model.js";
import {
  DeclarationHumanReviewDecision,
  type DeclarationHumanReviewSubmission,
} from "../domain/declarationHumanReview.types.js";
import { applyDeclarationHumanReviewAuthority } from "./applyDeclarationHumanReviewAuthority.js";
import { buildDeclarationHumanReviewRequest } from "./declarationHumanReviewContract.js";
import { DeclarationHumanReviewRunModel } from "./declarationHumanReviewRun.model.js";
import { persistDeclarationHumanReviewRun } from "./declarationHumanReviewRun.service.js";

function requireObjectId(value: string, label: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `Geçersiz ${label}.`);
  return new mongoose.Types.ObjectId(value);
}

async function loadCurrentResolution(companyId: mongoose.Types.ObjectId, declarationId: string) {
  const declarationObjectId = requireObjectId(declarationId, "declaration id");
  const declaration = await DeclarationModel.findOne({ _id: declarationObjectId, companyId }).lean();
  if (!declaration) throw new HttpError(404, "Declaration bulunamadı.");

  const resolutionRunId = declaration.idpResolution?.resolutionRunId;
  if (!resolutionRunId) throw new HttpError(409, "Declaration için current IDP resolution bulunmuyor.");

  const run = await DeclarationFieldResolutionRunModel.findOne({
    _id: resolutionRunId,
    companyId,
    declarationId: declarationObjectId,
  }).lean();
  if (!run) throw new HttpError(409, "Current IDP resolution run bulunamadı.");

  return { declarationObjectId, declaration, run };
}

export async function getCurrentDeclarationHumanReview(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
) {
  const { run } = await loadCurrentResolution(companyId, declarationId);
  if (run.resolution.reviewRequiredFields.length === 0) {
    return {
      required: false as const,
      sourceResolutionRunId: String(run._id),
      request: null,
    };
  }

  return {
    required: true as const,
    sourceResolutionRunId: String(run._id),
    request: buildDeclarationHumanReviewRequest({
      sourceResolutionRunId: String(run._id),
      resolution: run.resolution,
    }),
  };
}

export async function listDeclarationHumanReviewAudit(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
) {
  const declarationObjectId = requireObjectId(declarationId, "declaration id");
  const declaration = await DeclarationModel.findOne({ _id: declarationObjectId, companyId })
    .select({ _id: 1 })
    .lean();
  if (!declaration) throw new HttpError(404, "Declaration bulunamadı.");

  return DeclarationHumanReviewRunModel.find({
    companyId: String(companyId),
    declarationId: String(declarationObjectId),
  })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
}

export async function submitCurrentDeclarationHumanReview(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: string;
  actorUserId: mongoose.Types.ObjectId;
  body: Record<string, unknown>;
}) {
  const current = await getCurrentDeclarationHumanReview(params.companyId, params.declarationId);
  if (!current.required || !current.request) {
    throw new HttpError(409, "Current resolution human review gerektirmiyor.");
  }

  // Scope and actor are server-owned. The client can only submit the source run
  // it rendered and decisions over candidates already present in that request.
  const sourceResolutionRunId =
    typeof params.body.sourceResolutionRunId === "string" ? params.body.sourceResolutionRunId : "";
  const decisions = Array.isArray(params.body.decisions) ? params.body.decisions : [];

  const submission: DeclarationHumanReviewSubmission = {
    version: "1",
    companyId: String(params.companyId),
    declarationId: params.declarationId,
    sourceResolutionRunId,
    actorUserId: String(params.actorUserId),
    decisions: decisions as DeclarationHumanReviewSubmission["decisions"],
  };

  let persisted;
  try {
    persisted = await persistDeclarationHumanReviewRun({
      request: current.request,
      submission,
      currentSourceResolutionRunId: current.sourceResolutionRunId,
    });
  } catch (error) {
    throw new HttpError(409, error instanceof Error ? error.message : "Human review submission reddedildi.");
  }

  const hasKeepReviewRequired = persisted.run.decisions.some(
    (decision) => decision.decision === DeclarationHumanReviewDecision.KEEP_REVIEW_REQUIRED,
  );

  if (hasKeepReviewRequired) {
    return {
      reviewRunId: String(persisted.run._id),
      reviewStatus: persisted.run.status,
      reusedReviewRun: persisted.reused,
      authorityApplied: false as const,
      authority: null,
    };
  }

  try {
    const authority = await applyDeclarationHumanReviewAuthority({
      companyId: params.companyId,
      declarationId: requireObjectId(params.declarationId, "declaration id"),
      reviewRunId: persisted.run._id,
    });
    return {
      reviewRunId: String(persisted.run._id),
      reviewStatus: persisted.run.status,
      reusedReviewRun: persisted.reused,
      authorityApplied: true as const,
      authority,
    };
  } catch (error) {
    throw new HttpError(409, error instanceof Error ? error.message : "Human review authority uygulanamadı.");
  }
}
