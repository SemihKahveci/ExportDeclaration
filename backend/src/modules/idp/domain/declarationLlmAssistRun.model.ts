import mongoose, { Schema } from "mongoose";
import type { DeclarationLlmAssistRequest, DeclarationLlmAssistResponse } from "./declarationLlmAssist.types.js";

export interface DeclarationLlmAssistRunDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  assessmentRunId: mongoose.Types.ObjectId;
  request: DeclarationLlmAssistRequest;
  response: DeclarationLlmAssistResponse;
  assistKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationLlmAssistRunSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  assessmentRunId: { type: Schema.Types.ObjectId, required: true, ref: "DeclarationIntelligenceAssessmentRun", index: true },
  request: { type: Schema.Types.Mixed, required: true },
  response: { type: Schema.Types.Mixed, required: true },
  assistKey: { type: String, index: true }
}, { timestamps: true });

DeclarationLlmAssistRunSchema.index({ companyId: 1, declarationId: 1, createdAt: -1 });
DeclarationLlmAssistRunSchema.index(
  { companyId: 1, declarationId: 1, assistKey: 1 },
  { unique: true, partialFilterExpression: { assistKey: { $type: "string" } } }
);

export const DeclarationLlmAssistRunModel: mongoose.Model<DeclarationLlmAssistRunDoc> =
  (mongoose.models.DeclarationLlmAssistRun as mongoose.Model<DeclarationLlmAssistRunDoc> | undefined) ??
  mongoose.model<DeclarationLlmAssistRunDoc>("DeclarationLlmAssistRun", DeclarationLlmAssistRunSchema);
