import mongoose, { Schema } from "mongoose";

export const APPROVAL_LEVELS = [1, 2] as const;
export const DECLARATION_TYPES = ["ithalat", "ihracat", "transit", "antrepo"] as const;

export interface DeclarationApprovalRulesDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  ithalat: 1 | 2;
  ihracat: 1 | 2;
  transit: 1 | 2;
  antrepo: 1 | 2;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationApprovalRulesSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    ithalat: { type: Number, enum: APPROVAL_LEVELS, default: 1 },
    ihracat: { type: Number, enum: APPROVAL_LEVELS, default: 1 },
    transit: { type: Number, enum: APPROVAL_LEVELS, default: 1 },
    antrepo: { type: Number, enum: APPROVAL_LEVELS, default: 1 }
  },
  { timestamps: true }
);

export const DeclarationApprovalRulesModel =
  mongoose.models.DeclarationApprovalRules ??
  mongoose.model<DeclarationApprovalRulesDoc>(
    "DeclarationApprovalRules",
    DeclarationApprovalRulesSchema
  );

export const DEFAULT_DECLARATION_APPROVAL_RULES = {
  ithalat: 1 as const,
  ihracat: 1 as const,
  transit: 1 as const,
  antrepo: 1 as const
};
