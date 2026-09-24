import mongoose, { Schema } from "mongoose";
import type { DeclarationHumanReviewFieldDecision } from "../domain/declarationHumanReview.types.js";

export interface DeclarationHumanReviewRunDoc extends mongoose.Document {
  version: "1";
  companyId: string;
  declarationId: string;
  sourceResolutionRunId: string;
  actorUserId: string;
  reviewKey: string;
  status: "DECIDED" | "REVIEW_REQUIRED";
  decisions: DeclarationHumanReviewFieldDecision[];
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const decisionSchema = new Schema({
  field: { type: String, required: true },
  decision: { type: String, enum: ["SELECT_CANDIDATE", "KEEP_REVIEW_REQUIRED"], required: true },
  candidateId: { type: String },
  note: { type: String }
}, { _id: false });

const schema = new Schema({
  version: { type: String, enum: ["1"], required: true },
  companyId: { type: String, required: true, index: true },
  declarationId: { type: String, required: true, index: true },
  sourceResolutionRunId: { type: String, required: true, index: true },
  actorUserId: { type: String, required: true },
  reviewKey: { type: String, required: true },
  status: { type: String, enum: ["DECIDED", "REVIEW_REQUIRED"], required: true },
  decisions: { type: [decisionSchema], required: true },
  submittedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true, collection: "declaration_human_review_runs" });

schema.index({ companyId: 1, declarationId: 1, reviewKey: 1 }, { unique: true });

export const DeclarationHumanReviewRunModel: mongoose.Model<DeclarationHumanReviewRunDoc> =
  (mongoose.models.DeclarationHumanReviewRun as mongoose.Model<DeclarationHumanReviewRunDoc> | undefined)
  ?? mongoose.model<DeclarationHumanReviewRunDoc>("DeclarationHumanReviewRun", schema);
