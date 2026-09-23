import mongoose from "mongoose";
import { ProcessingStatus } from "./idp.types.js";
import { ProcessingRunModel } from "./processingRun.model.js";
import { loadDeclarationDocumentSet } from "./declarationDocumentSet.service.js";
import { assessDeclarationDocumentCoverage } from "./declarationDocumentCoverage.js";
import type { DeclarationDocumentCoverageProfile } from "./declarationDocumentCoverage.types.js";
import { assessDeclarationCrossDocumentConsistency } from "./declarationCrossDocumentConsistency.js";
import type { DeclarationCrossDocumentConsistencyProfile } from "./declarationCrossDocumentConsistency.types.js";
import { projectDeclarationFieldCandidates, type SourceFieldCandidates } from "./declarationFieldCandidateProjector.js";
import type { FieldCandidateEnvelope } from "./fieldCandidate.types.js";
import { isProcessingRunCandidateSnapshot } from "./processingRunCandidateSnapshot.js";
import { persistDeclarationIntelligenceAssessment } from "./declarationIntelligenceAssessment.service.js";

export type DeclarationIntelligenceOrchestrationResult =
  | { status: "NOT_READY"; reason: "NO_LOGICAL_DOCUMENTS" | "INVALID_DOCUMENT_SET" | "MISSING_PROCESSING_RUN_PROVENANCE" | "PROCESSING_INCOMPLETE" | "CANDIDATES_NOT_READY" | "RUN_DOCUMENT_OWNERSHIP_MISMATCH" }
  | { status: "BLOCKED"; reason: "PROCESSING_FAILED"; failedProcessingRunIds: string[] }
  | { status: "ASSESSED"; assessmentRunId: string; reusedAssessmentRun: boolean; readinessStatus: "READY" | "REVIEW_REQUIRED" | "INVALID_CONFIGURATION" };

/**
 * Production declaration-intelligence boundary for Foundation 7. It loads the
 * persisted declaration document set and only the ProcessingRuns referenced by
 * those logical documents, projects their persisted declaration-candidate
 * snapshots, evaluates caller-owned coverage/consistency profiles, and persists
 * the immutable assessment. It does not select authority or mutate normalized data.
 */
export async function orchestrateDeclarationIntelligence(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  coverageProfile: DeclarationDocumentCoverageProfile;
  consistencyProfile: DeclarationCrossDocumentConsistencyProfile;
  assessmentKey?: string;
}): Promise<DeclarationIntelligenceOrchestrationResult> {
  const loaded = await loadDeclarationDocumentSet({ companyId: params.companyId, declarationId: params.declarationId });
  const documents = loaded.documentSet.documents;
  if (documents.length === 0) return { status: "NOT_READY", reason: "NO_LOGICAL_DOCUMENTS" };
  if (!loaded.integrity.valid) return { status: "NOT_READY", reason: "INVALID_DOCUMENT_SET" };

  const runIds = [...new Set(documents.map((document) => document.sourceProcessingRunId ?? ""))];
  if (runIds.includes("")) return { status: "NOT_READY", reason: "MISSING_PROCESSING_RUN_PROVENANCE" };

  const runs = await ProcessingRunModel.find({
    _id: { $in: runIds.map((id) => new mongoose.Types.ObjectId(id)) },
    companyId: params.companyId,
    declarationId: params.declarationId
  }).lean();
  if (runs.length !== runIds.length) return { status: "NOT_READY", reason: "PROCESSING_INCOMPLETE" };

  const runById = new Map(runs.map((run) => [String(run._id), run]));
  if (documents.some((document) => {
    const run = runById.get(document.sourceProcessingRunId!);
    return run && String(run.uploadedFileId) !== document.uploadedFileId;
  })) return { status: "NOT_READY", reason: "RUN_DOCUMENT_OWNERSHIP_MISMATCH" };

  const failed = runs.filter((run) => run.status === ProcessingStatus.FAILED).map((run) => String(run._id)).sort();
  if (failed.length > 0) return { status: "BLOCKED", reason: "PROCESSING_FAILED", failedProcessingRunIds: failed };
  if (runs.some((run) => run.status !== ProcessingStatus.COMPLETED)) return { status: "NOT_READY", reason: "PROCESSING_INCOMPLETE" };
  if (runs.some((run) => !isProcessingRunCandidateSnapshot(run.declarationCandidates))) return { status: "NOT_READY", reason: "CANDIDATES_NOT_READY" };

  const sources: SourceFieldCandidates[] = runs.map((run) => ({
    uploadedFileId: String(run.uploadedFileId),
    sourceProcessingRunId: String(run._id),
    candidates: run.declarationCandidates as FieldCandidateEnvelope
  }));
  const declarationCandidates = projectDeclarationFieldCandidates({ documentSet: loaded.documentSet, sources });
  const coverage = assessDeclarationDocumentCoverage(loaded.documentSet, params.coverageProfile);
  const consistency = assessDeclarationCrossDocumentConsistency(declarationCandidates, params.consistencyProfile);
  const persisted = await persistDeclarationIntelligenceAssessment({
    companyId: params.companyId,
    declarationId: params.declarationId,
    coverage,
    consistency,
    assessmentKey: params.assessmentKey
  });

  return {
    status: "ASSESSED",
    assessmentRunId: String(persisted.run._id),
    reusedAssessmentRun: persisted.reused,
    readinessStatus: persisted.readiness.status
  };
}
