import mongoose, { Schema } from "mongoose";
import type { DeclarationFieldCandidateEnvelope } from "./declarationFieldCandidate.types.js";
import type { DeclarationFieldResolutionEnvelope } from "./declarationFieldResolution.types.js";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";

export interface DeclarationFieldResolutionRunDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  candidateEnvelope: DeclarationFieldCandidateEnvelope;
  rules: CrossDocumentFieldRule[];
  resolution: DeclarationFieldResolutionEnvelope;
  sourceProcessingRunIds: string[];
  orchestrationKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationFieldResolutionRunSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  declarationId: { type: Schema.Types.ObjectId, required: true, index: true },
  candidateEnvelope: { type: Schema.Types.Mixed, required: true },
  rules: { type: [Schema.Types.Mixed], default: [] },
  resolution: { type: Schema.Types.Mixed, required: true },
  sourceProcessingRunIds: { type: [String], default: [] },
  orchestrationKey: { type: String, index: true }
}, { timestamps: true });

DeclarationFieldResolutionRunSchema.index({ companyId: 1, declarationId: 1, createdAt: -1 });
DeclarationFieldResolutionRunSchema.index(
  { companyId: 1, declarationId: 1, orchestrationKey: 1 },
  { unique: true, partialFilterExpression: { orchestrationKey: { $type: "string" } } }
);

export const DeclarationFieldResolutionRunModel: mongoose.Model<DeclarationFieldResolutionRunDoc> =
  (mongoose.models.DeclarationFieldResolutionRun as mongoose.Model<DeclarationFieldResolutionRunDoc> | undefined) ??
  mongoose.model<DeclarationFieldResolutionRunDoc>("DeclarationFieldResolutionRun", DeclarationFieldResolutionRunSchema);
