import mongoose, { Schema } from "mongoose";
import { HumanReviewDecisionAction } from "./humanReview.types.js";

export interface HumanReviewDecisionDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  processingRunId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  uploadedFileId: mongoose.Types.ObjectId;
  issueId: string;
  field?: string;
  rowIndex?: number;
  action: string;
  candidateId?: string;
  value?: unknown;
  evidenceSnapshot?: unknown;
  reason?: string;
  decidedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const HumanReviewDecisionSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  processingRunId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  uploadedFileId: { type: Schema.Types.ObjectId, required: true, index: true },
  issueId: { type: String, required: true },
  field: String,
  rowIndex: Number,
  action: { type: String, enum: Object.values(HumanReviewDecisionAction), required: true },
  candidateId: String,
  value: Schema.Types.Mixed,
  evidenceSnapshot: Schema.Types.Mixed,
  reason: String,
  decidedBy: { type: Schema.Types.ObjectId, required: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

HumanReviewDecisionSchema.index({ companyId: 1, processingRunId: 1, createdAt: 1 });
HumanReviewDecisionSchema.index({ companyId: 1, processingRunId: 1, issueId: 1, createdAt: -1 });

export const HumanReviewDecisionModel: mongoose.Model<HumanReviewDecisionDoc> =
  (mongoose.models.HumanReviewDecision as mongoose.Model<HumanReviewDecisionDoc> | undefined) ??
  mongoose.model<HumanReviewDecisionDoc>("HumanReviewDecision", HumanReviewDecisionSchema);
