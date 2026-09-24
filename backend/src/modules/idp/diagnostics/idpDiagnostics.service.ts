import mongoose from "mongoose";
import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { UploadedFileModel } from "../../documents/document.model.js";

export type IdpRecoveryAction =
  | "NONE"
  | "WAIT_FOR_RETRY"
  | "RETRY_PROCESSING_RUN"
  | "INVESTIGATE_CONFIGURATION";

export interface IdpProcessingDiagnostic {
  processingRunId: string;
  companyId: string;
  declarationId: string;
  uploadedFileId: string;
  fileName: string | null;
  status: string;
  currentStage: string | null;
  attempt: number;
  processorVersion: string;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  error: { code: string | null; message: string | null; stage: string | null } | null;
  recoveryAction: IdpRecoveryAction;
}

function recoveryAction(run: any): IdpRecoveryAction {
  if (run.status === "COMPLETED" || run.status === "CANCELLED") return "NONE";
  if (run.status === "PROCESSING" || run.status === "QUEUED") return "WAIT_FOR_RETRY";
  if (run.status === "FAILED") {
    const message = String(run.error?.message ?? "").toLowerCase();
    if (message.includes("config") || message.includes("disabled") || message.includes("not configured")) {
      return "INVESTIGATE_CONFIGURATION";
    }
    return "RETRY_PROCESSING_RUN";
  }
  return "NONE";
}

export async function getIdpProcessingDiagnostic(input: {
  companyId: mongoose.Types.ObjectId;
  declarationId: string;
  processingRunId: string;
}): Promise<IdpProcessingDiagnostic | null> {
  if (!mongoose.isValidObjectId(input.processingRunId)) return null;
  const run = await ProcessingRunModel.findOne({
    _id: input.processingRunId,
    companyId: input.companyId,
    declarationId: input.declarationId
  }).lean();
  if (!run) return null;

  const file = await UploadedFileModel.findOne({
    _id: run.uploadedFileId,
    companyId: input.companyId,
    declarationId: input.declarationId
  }).select({ fileName: 1 }).lean();

  const startedAt = run.startedAt ?? null;
  const completedAt = run.completedAt ?? null;
  return {
    processingRunId: String(run._id),
    companyId: String(run.companyId),
    declarationId: String(run.declarationId),
    uploadedFileId: String(run.uploadedFileId),
    fileName: file?.fileName ?? null,
    status: run.status,
    currentStage: run.currentStage ?? null,
    attempt: run.attempt,
    processorVersion: run.processorVersion,
    queuedAt: run.createdAt,
    startedAt,
    completedAt,
    durationMs: startedAt && completedAt ? completedAt.getTime() - startedAt.getTime() : null,
    error: run.error ? {
      code: run.error.code ?? null,
      message: run.error.message ?? null,
      stage: run.currentStage ?? null
    } : null,
    recoveryAction: recoveryAction(run)
  };
}
