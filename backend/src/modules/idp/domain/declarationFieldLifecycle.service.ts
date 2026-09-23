import mongoose from "mongoose";
import { ProcessingStatus } from "./idp.types.js";
import { ProcessingRunModel } from "./processingRun.model.js";
import { LogicalDocumentModel } from "./logicalDocument.model.js";
import type { FieldCandidateEnvelope } from "./fieldCandidate.types.js";
import { isProcessingRunCandidateSnapshot } from "./processingRunCandidateSnapshot.js";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { SourceFieldCandidates } from "./declarationFieldCandidateProjector.js";
import { orchestrateDeclarationFieldResolution } from "./declarationFieldOrchestration.service.js";

export type DeclarationFieldLifecycleResult =
  | { status: "NOT_READY"; reason: "NO_LOGICAL_DOCUMENTS" | "MISSING_PROCESSING_RUN_PROVENANCE" | "PROCESSING_INCOMPLETE" | "CANDIDATES_NOT_READY" | "RUN_DOCUMENT_OWNERSHIP_MISMATCH" }
  | { status: "BLOCKED"; reason: "PROCESSING_FAILED"; failedProcessingRunIds: string[] }
  | { status: "ORCHESTRATED"; resolutionRunId: string; reusedResolutionRun: boolean; promotedFields: string[]; skippedReviewFields: string[] };

/**
 * Lifecycle bridge between per-file worker completion and declaration-wide
 * Foundation 6 orchestration. It is deliberately fail-closed: every persisted
 * logical document must point at a successful ProcessingRun with a candidate
 * envelope before declaration resolution may run.
 */
export async function tryOrchestrateDeclarationAfterProcessing(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  rules?: CrossDocumentFieldRule[];
}): Promise<DeclarationFieldLifecycleResult> {
  const documents = await LogicalDocumentModel.find({
    companyId: params.companyId,
    declarationId: params.declarationId
  }).lean();
  if (documents.length === 0) return { status: "NOT_READY", reason: "NO_LOGICAL_DOCUMENTS" };

  const runIds = [...new Set(documents.map((doc) => doc.sourceProcessingRunId ? String(doc.sourceProcessingRunId) : ""))];
  if (runIds.includes("")) return { status: "NOT_READY", reason: "MISSING_PROCESSING_RUN_PROVENANCE" };

  const runs = await ProcessingRunModel.find({
    _id: { $in: runIds.map((id) => new mongoose.Types.ObjectId(id)) },
    companyId: params.companyId,
    declarationId: params.declarationId
  }).lean();
  if (runs.length !== runIds.length) return { status: "NOT_READY", reason: "PROCESSING_INCOMPLETE" };
  // A ProcessingRun may serve multiple logical segments of the SAME physical file,
  // but it must never be reused as provenance for a different UploadedFile.
  const runById = new Map(runs.map((run) => [String(run._id), run]));
  if (documents.some((doc) => {
    const run = runById.get(String(doc.sourceProcessingRunId));
    return run && String(run.uploadedFileId) !== String(doc.uploadedFileId);
  })) {
    return { status: "NOT_READY", reason: "RUN_DOCUMENT_OWNERSHIP_MISMATCH" };
  }

  const failed = runs.filter((run) => run.status === ProcessingStatus.FAILED).map((run) => String(run._id)).sort();
  if (failed.length > 0) return { status: "BLOCKED", reason: "PROCESSING_FAILED", failedProcessingRunIds: failed };
  if (runs.some((run) => run.status !== ProcessingStatus.COMPLETED)) {
    return { status: "NOT_READY", reason: "PROCESSING_INCOMPLETE" };
  }
  if (runs.some((run) => !isProcessingRunCandidateSnapshot(run.declarationCandidates))) {
    return { status: "NOT_READY", reason: "CANDIDATES_NOT_READY" };
  }

  const sources: SourceFieldCandidates[] = runs.map((run) => ({
    uploadedFileId: String(run.uploadedFileId),
    sourceProcessingRunId: String(run._id),
    candidates: run.declarationCandidates as FieldCandidateEnvelope
  }));
  const result = await orchestrateDeclarationFieldResolution({
    companyId: params.companyId,
    declarationId: params.declarationId,
    sources,
    rules: params.rules ?? []
  });
  return {
    status: "ORCHESTRATED",
    resolutionRunId: result.resolutionRunId,
    reusedResolutionRun: result.reusedResolutionRun,
    promotedFields: result.promotion.promotedFields,
    skippedReviewFields: result.promotion.skippedReviewFields
  };
}
