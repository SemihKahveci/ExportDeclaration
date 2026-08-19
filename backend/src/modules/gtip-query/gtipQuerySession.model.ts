import mongoose, { Schema } from "mongoose";

export const QUERY_RESULT_STATUSES = ["Bulundu", "Operasyon Girişi Gerekli"] as const;
export const QUERY_APPROVAL_STATUSES = ["Onaylı", "Onay Bekliyor", "Giriş Bekliyor"] as const;

export interface GtipQueryItemDoc {
  _id: mongoose.Types.ObjectId;
  materialNo: string;
  description: string;
  foundGtip: string;
  status: (typeof QUERY_RESULT_STATUSES)[number];
  approvalStatus: (typeof QUERY_APPROVAL_STATUSES)[number];
}

export interface GtipQuerySessionDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  customerName: string;
  fileName: string;
  pdfType: string;
  items: GtipQueryItemDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const GtipQueryItemSchema = new Schema(
  {
    materialNo: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    foundGtip: { type: String, default: "—" },
    status: { type: String, enum: QUERY_RESULT_STATUSES, required: true },
    approvalStatus: { type: String, enum: QUERY_APPROVAL_STATUSES, required: true }
  },
  { _id: true }
);

const GtipQuerySessionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    customerId: { type: String, default: "" },
    customerName: { type: String, default: "" },
    fileName: { type: String, default: "" },
    pdfType: { type: String, default: "" },
    items: { type: [GtipQueryItemSchema], default: [] }
  },
  { timestamps: true, collection: "gtipqueryresults" }
);

export const GtipQuerySessionModel =
  mongoose.models.GtipQuerySession ??
  mongoose.model<GtipQuerySessionDoc>("GtipQuerySession", GtipQuerySessionSchema);
