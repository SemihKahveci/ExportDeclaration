import mongoose, { Schema } from "mongoose";

export const DOC_PARSE_STATUSES = ["Evet", "Hayır"] as const;
export const DOC_TEST_RESULTS = [
  "Başarılı",
  "Kısmi Başarılı",
  "Test Bekliyor",
  "Başarısız"
] as const;
export const DOC_PROCESS_STATUSES = ["Aktif", "Pasif"] as const;

export interface DocumentProcessDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  process: string;
  format: string;
  parseable: (typeof DOC_PARSE_STATUSES)[number];
  testResult: (typeof DOC_TEST_RESULTS)[number];
  successRate: string;
  supportNote: string;
  status: (typeof DOC_PROCESS_STATUSES)[number];
  createdAt: Date;
  updatedAt: Date;
}

const DocumentProcessSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    process: { type: String, required: true, trim: true },
    format: { type: String, default: "—" },
    parseable: { type: String, enum: DOC_PARSE_STATUSES, default: "Evet" },
    testResult: { type: String, enum: DOC_TEST_RESULTS, default: "Test Bekliyor" },
    successRate: { type: String, default: "—" },
    supportNote: { type: String, default: "" },
    status: { type: String, enum: DOC_PROCESS_STATUSES, default: "Aktif" }
  },
  { timestamps: true }
);

DocumentProcessSchema.index({ companyId: 1, name: 1 });

export const DocumentProcessModel =
  mongoose.models.DocumentProcess ??
  mongoose.model<DocumentProcessDoc>("DocumentProcess", DocumentProcessSchema);
