import mongoose, { Schema } from "mongoose";

export const TRANSACTION_TYPES = ["ithalat", "ihracat", "transit", "antrepo"] as const;
export const RECORD_STATUSES = ["verified", "pending", "rejected"] as const;
export const RECORD_SOURCES = ["manuel", "fatura"] as const;
export const MATERIAL_FIELD_KEYS = ["materialNo", "description", "gtipNo"] as const;

export interface MaterialPendingUpdate {
  materialNo: string;
  description: string;
  gtipNo: string;
}

export interface MaterialRejection {
  fields: (typeof MATERIAL_FIELD_KEYS)[number][];
  note: string;
}

export interface MaterialRecordDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  materialNo: string;
  description: string;
  gtipNo: string;
  transactionTypes: (typeof TRANSACTION_TYPES)[number][];
  status: (typeof RECORD_STATUSES)[number];
  source: (typeof RECORD_SOURCES)[number];
  pendingUpdate?: MaterialPendingUpdate | null;
  rejection?: MaterialRejection | null;
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
    source: { type: String, enum: RECORD_SOURCES, default: "manuel" },
    pendingUpdate: {
      type: new Schema(
        {
          materialNo: { type: String, required: true, trim: true },
          description: { type: String, required: true, trim: true },
          gtipNo: { type: String, required: true, trim: true }
        },
        { _id: false }
      ),
      default: undefined
    },
    rejection: {
      type: new Schema(
        {
          fields: { type: [String], enum: MATERIAL_FIELD_KEYS, default: [] },
          note: { type: String, default: "", trim: true }
        },
        { _id: false }
      ),
      default: undefined
    }
  },
  { timestamps: true }
);

MaterialRecordSchema.index({ companyId: 1, customerId: 1, materialNo: 1 }, { unique: true });

export const MaterialRecordModel =
  mongoose.models.MaterialRecord ??
  mongoose.model<MaterialRecordDoc>("MaterialRecord", MaterialRecordSchema);
