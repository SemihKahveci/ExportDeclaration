import mongoose, { Schema } from "mongoose";

export const DOCUMENT_RULE_CONDITION_FIELDS = [
  "mensei",
  "teslim_ulkesi",
  "gonderici_ulkesi",
  "gtip_no"
] as const;

export const DOCUMENT_RULE_CONDITION_OPERATORS = ["equals", "starts_with"] as const;

export interface DocumentRuleCondition {
  field: (typeof DOCUMENT_RULE_CONDITION_FIELDS)[number];
  operator: (typeof DOCUMENT_RULE_CONDITION_OPERATORS)[number];
  value: string;
  enabled: boolean;
}

export interface DocumentRuleDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  conditions: DocumentRuleCondition[];
  requiredDocuments: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentRuleConditionSchema = new Schema(
  {
    field: { type: String, enum: DOCUMENT_RULE_CONDITION_FIELDS, required: true },
    operator: { type: String, enum: DOCUMENT_RULE_CONDITION_OPERATORS, required: true },
    value: { type: String, default: "" },
    enabled: { type: Boolean, default: false }
  },
  { _id: false }
);

const DocumentRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    conditions: { type: [DocumentRuleConditionSchema], default: [] },
    requiredDocuments: { type: [String], default: [] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

DocumentRuleSchema.index({ companyId: 1, name: 1 });

export const DocumentRuleModel =
  mongoose.models.DocumentRule ??
  mongoose.model<DocumentRuleDoc>("DocumentRule", DocumentRuleSchema);
