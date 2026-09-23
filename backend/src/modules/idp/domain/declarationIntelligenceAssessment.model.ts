import mongoose, { Schema } from "mongoose";
import type { DeclarationCrossDocumentConsistencyResult } from "./declarationCrossDocumentConsistency.types.js";
import type { DeclarationDocumentCoverageResult } from "./declarationDocumentCoverage.types.js";
import type { DeclarationIntelligenceReadinessResult } from "./declarationIntelligenceReadiness.types.js";

export interface DeclarationIntelligenceAssessmentRunDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  coverage: DeclarationDocumentCoverageResult;
  consistency: DeclarationCrossDocumentConsistencyResult;
  readiness: DeclarationIntelligenceReadinessResult;
  assessmentKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationIntelligenceAssessmentRunSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  coverage: { type: Schema.Types.Mixed, required: true },
  consistency: { type: Schema.Types.Mixed, required: true },
  readiness: { type: Schema.Types.Mixed, required: true },
  assessmentKey: { type: String, index: true }
}, { timestamps: true });

DeclarationIntelligenceAssessmentRunSchema.index({ companyId: 1, declarationId: 1, createdAt: -1 });
DeclarationIntelligenceAssessmentRunSchema.index(
  { companyId: 1, declarationId: 1, assessmentKey: 1 },
  { unique: true, partialFilterExpression: { assessmentKey: { $type: "string" } } }
);

export const DeclarationIntelligenceAssessmentRunModel: mongoose.Model<DeclarationIntelligenceAssessmentRunDoc> =
  (mongoose.models.DeclarationIntelligenceAssessmentRun as mongoose.Model<DeclarationIntelligenceAssessmentRunDoc> | undefined) ??
  mongoose.model<DeclarationIntelligenceAssessmentRunDoc>(
    "DeclarationIntelligenceAssessmentRun",
    DeclarationIntelligenceAssessmentRunSchema
  );
