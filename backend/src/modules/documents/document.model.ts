import mongoose, { Schema } from "mongoose";
import { DocumentType } from "../../common/enums/documentType.js";

/** Mongoose `Document.errors` (ValidationError) ile çakışmaması için şema alanı `parseErrors`. API’de hata listesi aynı anlamda. */
export interface DocumentDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  type: string;
  fileName?: string;
  filePath?: string;
  storageKey?: string;
  mimeType?: string;
  size?: number;
  sha256?: string;
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
    filePath: String, // legacy absolute path; storageKey is canonical going forward
    storageKey: { type: String, index: true },
    mimeType: String,
    size: Number,
    sha256: { type: String, index: true },

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

// Collection name is intentionally preserved for a migration-free foundation refactor.
export const UploadedFileModel =
  mongoose.models.UploadedDocument ?? mongoose.model<DocumentDoc>("UploadedDocument", DocumentSchema);

/** @deprecated Use UploadedFileModel in new IDP code. Kept while declaration normalization is migrated. */
export const UploadedDocumentModel = UploadedFileModel;
