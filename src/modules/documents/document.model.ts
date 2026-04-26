import mongoose, { Schema } from "mongoose";
import { DocumentType } from "../../common/enums/documentType.js";

/** Mongoose `Document.errors` (ValidationError) ile çakışmaması için şema alanı `parseErrors`. API’de hata listesi aynı anlamda. */
export interface DocumentDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  type: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  extractionStatus: string;
  extractedData?: unknown;
  parseErrors: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    declarationId: { type: Schema.Types.ObjectId, required: true, index: true },

    type: {
      type: String,
      enum: Object.values(DocumentType),
      required: true
    },

    fileName: String,
    filePath: String,
    mimeType: String,

    extractionStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "MANUAL_REQUIRED"],
      default: "PENDING"
    },

    extractedData: Schema.Types.Mixed,

    parseErrors: { type: [String], default: [] }
  },
  { timestamps: true }
);

export const UploadedDocumentModel =
  mongoose.models.UploadedDocument ?? mongoose.model<DocumentDoc>("UploadedDocument", DocumentSchema);
