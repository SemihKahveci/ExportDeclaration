import mongoose, { Schema } from "mongoose";

export const EVRAK_CONDITION_FIELDS = [
  "mensei",
  "teslim_ulkesi",
  "gonderici_ulkesi",
  "gtip_no"
] as const;

export const EVRAK_CONDITION_OPERATORS = ["equals", "starts_with"] as const;

export interface EvrakRuleCondition {
  field: (typeof EVRAK_CONDITION_FIELDS)[number];
  operator: (typeof EVRAK_CONDITION_OPERATORS)[number];
  value: string;
  enabled: boolean;
}

export interface EvrakRuleDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  conditions: EvrakRuleCondition[];
  requiredDocuments: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EvrakRuleConditionSchema = new Schema(
  {
    field: { type: String, enum: EVRAK_CONDITION_FIELDS, required: true },
    operator: { type: String, enum: EVRAK_CONDITION_OPERATORS, required: true },
    value: { type: String, default: "" },
    enabled: { type: Boolean, default: false }
  },
  { _id: false }
);

const EvrakRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    conditions: { type: [EvrakRuleConditionSchema], default: [] },
    requiredDocuments: { type: [String], default: [] },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

EvrakRuleSchema.index({ companyId: 1, name: 1 });

export const EvrakRuleModel =
  mongoose.models.EvrakRule ?? mongoose.model<EvrakRuleDoc>("EvrakRule", EvrakRuleSchema);
