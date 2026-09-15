import mongoose from "mongoose";
import { HttpError } from "../../../common/middlewares/errorHandler.js";
import { env } from "../../../config/env.js";
import { UploadedDocumentModel } from "../../documents/document.model.js";
import { LogicalDocumentModel } from "../domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../domain/idp.types.js";
import { getIdpQueue } from "./idpQueue.js";

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
  const run = await ProcessingRunModel.create({
    companyId,
    declarationId: file.declarationId,
    uploadedFileId: file._id,
    logicalDocumentId: logical?._id,
    status: ProcessingStatus.QUEUED,
    currentStage: ProcessingStage.INGEST,
    processorVersion: env.idpProcessorVersion
  });
  await getIdpQueue().add("process-document", { processingRunId: String(run._id) }, { jobId: String(run._id) });
  return run.toObject();
}

export async function listProcessingRuns(companyId: mongoose.Types.ObjectId, uploadedFileId: string) {
  return ProcessingRunModel.find({ companyId, uploadedFileId }).sort({ createdAt: -1 }).lean();
}
