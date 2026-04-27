import mongoose, { Schema } from "mongoose";
import { DeclarationStatus } from "../../common/enums/declarationStatus.js";
import { DocumentTypeValue } from "../../common/enums/documentType.js";

export interface DeclarationDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  status: string;
  normalizedData?: unknown;
  sourceTrace?: Record<string, { value: unknown; source: DocumentTypeValue | string | null }>;
  generatedXmlPath?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },

    status: {
      type: String,
      enum: Object.values(DeclarationStatus),
      default: DeclarationStatus.DRAFT
    },

    normalizedData: {
      header: {
        invoiceNo: String,
        invoiceDate: Date,
        currency: String,
        totalAmount: Number
      },
      evrimHeader: Schema.Types.Mixed,
      parties: {
        seller: {
          name: String,
          taxNo: String,
          address: String,
          country: String
        },
        buyer: {
          name: String,
          taxNo: String,
          address: String,
          country: String
        },
        notify: {
          name: String,
          address: String
        }
      },
      trade: {
        deliveryTerm: String,
        paymentType: String,
        origin: String
      },
      transport: {
        mode: String
      },
      packageInfo: {
        totalPackage: Number,
        packageType: String,
        grossKg: Number,
        netKg: Number
      },
      goodsLines: [
        {
          lineNo: Number,
          hsCode: String,
          description: String,
          quantity: Number,
          unit: String,
          unitPrice: Number,
          lineTotal: Number,
          origin: String,
          grossKg: Number,
          netKg: Number
        }
      ]
    },

    sourceTrace: Schema.Types.Mixed,

    generatedXmlPath: String,

    createdBy: { type: Schema.Types.ObjectId }
  },
  { timestamps: true }
);

export const DeclarationModel =
  mongoose.models.Declaration ?? mongoose.model<DeclarationDoc>("Declaration", DeclarationSchema);
