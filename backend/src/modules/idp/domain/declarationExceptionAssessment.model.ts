import mongoose, { Schema } from "mongoose";
import type { DeclarationExceptionAssessment, DeclarationExceptionPolicy } from "./declarationException.types.js";

export interface DeclarationExceptionAssessmentRunDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  sourceResolutionRunId: mongoose.Types.ObjectId;
  sourceIntelligenceAssessmentRunId?: mongoose.Types.ObjectId;
  policy: DeclarationExceptionPolicy;
  assessment: DeclarationExceptionAssessment;
  assessmentKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationExceptionAssessmentRunSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  sourceResolutionRunId: { type: Schema.Types.ObjectId, required: true, index: true },
  sourceIntelligenceAssessmentRunId: { type: Schema.Types.ObjectId, index: true },
  policy: { type: Schema.Types.Mixed, required: true },
  assessment: { type: Schema.Types.Mixed, required: true },
  assessmentKey: { type: String, required: true, index: true },
}, { timestamps: true });

DeclarationExceptionAssessmentRunSchema.index({ companyId: 1, declarationId: 1, createdAt: -1 });
DeclarationExceptionAssessmentRunSchema.index(
  { companyId: 1, declarationId: 1, assessmentKey: 1 },
  { unique: true },
);

export const DeclarationExceptionAssessmentRunModel: mongoose.Model<DeclarationExceptionAssessmentRunDoc> =
  (mongoose.models.DeclarationExceptionAssessmentRun as mongoose.Model<DeclarationExceptionAssessmentRunDoc> | undefined) ??
  mongoose.model<DeclarationExceptionAssessmentRunDoc>(
    "DeclarationExceptionAssessmentRun",
    DeclarationExceptionAssessmentRunSchema,
  );
