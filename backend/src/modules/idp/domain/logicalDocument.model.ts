import mongoose, { Schema } from "mongoose";
import { DocumentType } from "../../../common/enums/documentType.js";

export interface LogicalDocumentDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  uploadedFileId: mongoose.Types.ObjectId;
  type: string;
  pageStart: number;
  pageEnd?: number;
  classificationConfidence?: number;
  classificationMethod?: "UPLOAD_DECLARED" | "DETERMINISTIC";
  classificationEvidence?: string[];
  sourceProcessingRunId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LogicalDocumentSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  uploadedFileId: { type: Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, enum: Object.values(DocumentType), required: true },
  pageStart: { type: Number, min: 1, default: 1 },
  pageEnd: { type: Number, min: 1 },
  classificationConfidence: { type: Number, min: 0, max: 1 },
  classificationMethod: { type: String, enum: ["UPLOAD_DECLARED", "DETERMINISTIC"], default: "UPLOAD_DECLARED" },
  classificationEvidence: { type: [String], default: [] },
  sourceProcessingRunId: { type: Schema.Types.ObjectId, index: true }
}, { timestamps: true });

LogicalDocumentSchema.index({ uploadedFileId: 1, pageStart: 1, pageEnd: 1 }, { unique: true });

export const LogicalDocumentModel: mongoose.Model<LogicalDocumentDoc> =
  (mongoose.models.LogicalDocument as mongoose.Model<LogicalDocumentDoc> | undefined) ??
  mongoose.model<LogicalDocumentDoc>("LogicalDocument", LogicalDocumentSchema);
