import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { HttpError } from "../../../common/middlewares/errorHandler.js";
import { env } from "../../../config/env.js";
import { UploadedDocumentModel } from "../../documents/document.model.js";
import { LogicalDocumentModel } from "../domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../domain/idp.types.js";
import { getIdpQueue } from "./idpQueue.js";

export function buildProcessingEnqueueKey(input: {
  companyId: mongoose.Types.ObjectId | string;
  declarationId: mongoose.Types.ObjectId | string;
  uploadedFileId: mongoose.Types.ObjectId | string;
  processorVersion: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    companyId: String(input.companyId),
    declarationId: String(input.declarationId),
    uploadedFileId: String(input.uploadedFileId),
    processorVersion: input.processorVersion
  })).digest("hex");
}

export async function enqueueDocumentProcessing(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: string;
  uploadedFileId: string;
}) {
  const { companyId, declarationId, uploadedFileId } = params;
  if (!mongoose.isValidObjectId(uploadedFileId)) throw new HttpError(400, "Geçersiz dosya id.");
  const file = await UploadedDocumentModel.findOne({ _id: uploadedFileId, companyId, declarationId });
  if (!file) throw new HttpError(404, "Dosya bulunamadı.");

  const logical = await LogicalDocumentModel.findOne({ uploadedFileId: file._id }).sort({ pageStart: 1 });
  const enqueueKey = buildProcessingEnqueueKey({
    companyId,
    declarationId: file.declarationId,
    uploadedFileId: file._id,
    processorVersion: env.idpProcessorVersion
  });

  // The deterministic key is the durable idempotency boundary. Concurrent API
  // requests for the same physical upload + processor version converge on one
  // ProcessingRun. A later processor version naturally creates a new run.
  let run = await ProcessingRunModel.findOne({ enqueueKey });
  if (!run) {
    try {
      run = await ProcessingRunModel.create({
        companyId,
        declarationId: file.declarationId,
        uploadedFileId: file._id,
        logicalDocumentId: logical?._id,
        status: ProcessingStatus.QUEUED,
        currentStage: ProcessingStage.INGEST,
        processorVersion: env.idpProcessorVersion,
        enqueueKey
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      run = await ProcessingRunModel.findOne({ enqueueKey });
      if (!run) throw error;
    }
  }

  // BullMQ jobId is the same durable ProcessingRun id. Repeated add() calls
  // therefore cannot create a second queue job for this exact processing unit.
  //
  // A terminal FAILED BullMQ job is different: Queue.add() with the same jobId
  // is intentionally idempotent and will not reactivate the retained failed job.
  // Explicitly retry that terminal job so a user can repair the input and invoke
  // the normal enqueue API again without creating a replacement ProcessingRun.
  if (run.status !== ProcessingStatus.COMPLETED && run.status !== ProcessingStatus.CANCELLED) {
    const queue = getIdpQueue();
    const jobId = String(run._id);
    const existingJob = await queue.getJob(jobId);

    if (run.status === ProcessingStatus.FAILED && existingJob && await existingJob.getState() === "failed") {
      try {
        await existingJob.retry("failed");
      } catch (error) {
        // Concurrent re-enqueue requests may race after the first request has
        // already moved the failed job back to an executable state. Treat that
        // as idempotent success; only propagate if it is still terminal failed.
        if (await existingJob.getState() === "failed") throw error;
      }
    } else {
      await queue.add(
        "process-document",
        { processingRunId: jobId },
        { jobId }
      );
    }
  }
  return run.toObject();
}

export async function listProcessingRuns(companyId: mongoose.Types.ObjectId, uploadedFileId: string) {
  return ProcessingRunModel.find({ companyId, uploadedFileId }).sort({ createdAt: -1 }).lean();
}
