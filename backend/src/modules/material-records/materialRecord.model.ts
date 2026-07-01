import mongoose, { Schema } from "mongoose";

export const TRANSACTION_TYPES = ["ithalat", "ihracat", "transit", "antrepo"] as const;
export const RECORD_STATUSES = ["verified", "pending"] as const;
export const RECORD_SOURCES = ["manuel", "fatura"] as const;

export interface MaterialRecordDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  materialNo: string;
  description: string;
  gtipNo: string;
  transactionTypes: (typeof TRANSACTION_TYPES)[number][];
  status: (typeof RECORD_STATUSES)[number];
  source: (typeof RECORD_SOURCES)[number];
  createdAt: Date;
  updatedAt: Date;
}

const MaterialRecordSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    materialNo: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    gtipNo: { type: String, required: true, trim: true },
    transactionTypes: {
      type: [String],
      enum: TRANSACTION_TYPES,
      default: ["ithalat", "ihracat", "transit", "antrepo"]
    },
    status: { type: String, enum: RECORD_STATUSES, default: "pending" },
    source: { type: String, enum: RECORD_SOURCES, default: "manuel" }
  },
  { timestamps: true }
);

MaterialRecordSchema.index({ companyId: 1, customerId: 1 });

export const MaterialRecordModel =
  mongoose.models.MaterialRecord ??
  mongoose.model<MaterialRecordDoc>("MaterialRecord", MaterialRecordSchema);
