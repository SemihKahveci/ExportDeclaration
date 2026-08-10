import mongoose, { Schema } from "mongoose";
import { DeclarationStatus } from "../../common/enums/declarationStatus.js";
import { DocumentTypeValue } from "../../common/enums/documentType.js";
import {
  FILE_STATUSES,
  OPERATION_TYPES
} from "../../common/enums/operationMeta.js";

export interface OperationMetaDoc {
  ref: string;
  customerId?: string;
  customerName: string;
  customerCity: string;
  fileStatus: string;
  operationType: string;
  isArchived: boolean;
  transportMode?: string | null;
  line?: string | null;
  declarationNo?: string | null;
  tescilNo?: string | null;
  assigneeName?: string | null;
  escalation: boolean;
  missingDocuments: string[];
  lastActivity: string;
  closedAt?: Date | null;
  receivedAt: Date;
  tescilStatus?: string | null;
  tescilRisk?: string;
  hasSecondNotif: boolean;
  tescilDays: number;
  kapanisStatus?: string | null;
  tescilDurumu?: string;
  kapanicDurumu?: string;
  mailRecipient?: string;
  mailSubject?: string;
  mailBody?: string;
}

export interface DeclarationDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  status: string;
  operation?: OperationMetaDoc;
  normalizedData?: unknown;
  sourceTrace?: Record<string, { value: unknown; source: DocumentTypeValue | string | null }>;
  generatedXmlPath?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OperationMetaSchema = new Schema(
  {
    ref: { type: String, required: true, trim: true },
    customerId: { type: String, trim: true },
    customerName: { type: String, default: "—", trim: true },
    customerCity: { type: String, default: "—", trim: true },
    fileStatus: { type: String, enum: FILE_STATUSES, default: "yeni-talep" },
    operationType: { type: String, enum: OPERATION_TYPES, default: "ihracat" },
    isArchived: { type: Boolean, default: false },
    transportMode: { type: String, default: null },
    line: { type: String, default: null },
    declarationNo: { type: String, default: null, trim: true },
    tescilNo: { type: String, default: null, trim: true },
    assigneeName: { type: String, default: null, trim: true },
    escalation: { type: Boolean, default: false },
    missingDocuments: { type: [String], default: [] },
    lastActivity: { type: String, default: "Oluşturuldu", trim: true },
    closedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: () => new Date() },
    tescilStatus: { type: String, default: null },
    tescilRisk: { type: String, default: "", trim: true },
    hasSecondNotif: { type: Boolean, default: false },
    tescilDays: { type: Number, default: 0 },
    kapanisStatus: { type: String, default: null },
    tescilDurumu: { type: String, default: "", trim: true },
    kapanicDurumu: { type: String, default: "", trim: true },
    mailRecipient: { type: String, default: "", trim: true },
    mailSubject: { type: String, default: "", trim: true },
    mailBody: { type: String, default: "", trim: true }
  },
  { _id: false }
);

const DeclarationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },

    status: {
      type: String,
      enum: Object.values(DeclarationStatus),
      default: DeclarationStatus.DRAFT
    },

    operation: { type: OperationMetaSchema },

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
