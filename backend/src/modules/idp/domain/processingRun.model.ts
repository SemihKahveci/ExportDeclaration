import mongoose, { Schema } from "mongoose";
import { ProcessingStage, ProcessingStatus } from "./idp.types.js";

export interface ProcessingRunDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  uploadedFileId: mongoose.Types.ObjectId;
  logicalDocumentId?: mongoose.Types.ObjectId;
  status: string;
  currentStage: string;
  attempt: number;
  processorVersion: string;
  modelVersion?: string;
  canonicalDocument?: unknown;
  segments?: unknown;
  rawExtraction?: unknown;
  candidates?: unknown;
  resolvedResult?: unknown;
  validationResult?: unknown;
  finalResult?: unknown;
  error?: { code?: string; message: string; stack?: string };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProcessingRunSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  uploadedFileId: { type: Schema.Types.ObjectId, required: true, index: true },
  logicalDocumentId: { type: Schema.Types.ObjectId, index: true },
  status: { type: String, enum: Object.values(ProcessingStatus), required: true, default: ProcessingStatus.QUEUED, index: true },
  currentStage: { type: String, enum: Object.values(ProcessingStage), required: true, default: ProcessingStage.INGEST },
  attempt: { type: Number, default: 0 },
  processorVersion: { type: String, required: true },
  modelVersion: String,
  canonicalDocument: Schema.Types.Mixed,
  segments: Schema.Types.Mixed,
  rawExtraction: Schema.Types.Mixed,
  candidates: Schema.Types.Mixed,
  resolvedResult: Schema.Types.Mixed,
  validationResult: Schema.Types.Mixed,
  finalResult: Schema.Types.Mixed,
  error: { code: String, message: String, stack: String },
  startedAt: Date,
  completedAt: Date
}, { timestamps: true });

ProcessingRunSchema.index({ uploadedFileId: 1, createdAt: -1 });

export const ProcessingRunModel = mongoose.models.ProcessingRun ??
  mongoose.model<ProcessingRunDoc>("ProcessingRun", ProcessingRunSchema);
