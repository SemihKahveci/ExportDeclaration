import mongoose, { Schema } from "mongoose";
import { DeclarationStatus } from "../../common/enums/declarationStatus.js";
import { DocumentTypeValue } from "../../common/enums/documentType.js";
import {
  FILE_STATUSES,
  OPERATION_TYPES
} from "../../common/enums/operationMeta.js";

export interface OperationWorkflowHistoryEntry {
  action: "START_WRITING" | "START_WRITING_WITH_MISSING_DOCUMENTS" | "SUBMIT_TO_MT" | "APPROVE_MT" | "RECORD_REGISTRATION_STARTED" | "COMPLETE_REGISTRATION" | "CLOSE_FILE";
  fromStatus: string;
  toStatus: string;
  actorUserId: mongoose.Types.ObjectId;
  override: boolean;
  reason?: string;
  at: Date;
}
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
  workflowHistory: OperationWorkflowHistoryEntry[];
}

export type ApprovalWorkflowStatus = "FIRST_PENDING" | "SECOND_PENDING" | "APPROVED" | "RETURNED";
export interface ApprovalHistoryEntry {
  action: string;
  fromStatus: ApprovalWorkflowStatus;
  toStatus: ApprovalWorkflowStatus;
  actorUserId: mongoose.Types.ObjectId;
  note?: string;
  at: Date;
}
export interface ApprovalWorkflowDoc {
  status: ApprovalWorkflowStatus;
  requiresSecondApproval: boolean;
  note: string;
  history: ApprovalHistoryEntry[];
  updatedAt: Date;
}

export interface DeclarationDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  status: string;
  operation?: OperationMetaDoc;
  normalizedData?: unknown;
  sourceTrace?: Record<string, { value: unknown; source: DocumentTypeValue | string | null }>;
  generatedXmlPath?: string;
  approvalWorkflow?: ApprovalWorkflowDoc;
  idpIntelligencePolicy?: {
    version: "1";
    coverageProfile: unknown;
    consistencyProfile: unknown;
  };
  idpIntelligence?: {
    version: "1";
    assessmentRunId: mongoose.Types.ObjectId;
    status: "READY" | "REVIEW_REQUIRED" | "INVALID_CONFIGURATION";
    issues: unknown[];
    assessedAt: Date;
  };
  idpLlmAssistPolicy?: {
    version: "1";
    enabled: boolean;
    autoApplyResolvedAuthority: boolean;
  };
  idpLlmAssist?: {
    version: "1";
    assistRunId: mongoose.Types.ObjectId;
    assessmentRunId: mongoose.Types.ObjectId;
    decision: "RESOLVED" | "REVIEW_REQUIRED";
    selections: Array<{ field: string; candidateId: string }>;
    issues: Array<{ code: string; message: string }>;
    model: string;
    provider: string;
    assistedAt: Date;
  };
  idpResolution?: {
    version: "1";
    resolutionRunId: mongoose.Types.ObjectId;
    reviewRequiredFields: string[];
    fields: Record<string, unknown>;
    resolvedAt: Date;
  };
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}


const OperationWorkflowHistorySchema = new Schema(
  {
    action: { type: String, enum: ["START_WRITING","START_WRITING_WITH_MISSING_DOCUMENTS","SUBMIT_TO_MT","APPROVE_MT","RECORD_REGISTRATION_STARTED","COMPLETE_REGISTRATION","CLOSE_FILE"], required: true },
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, required: true },
    override: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    at: { type: Date, default: () => new Date() }
  },
  { _id: false }
);

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
    mailBody: { type: String, default: "", trim: true },
    workflowHistory: { type: [OperationWorkflowHistorySchema], default: [] }
  },
  { _id: false }
);


const ApprovalHistorySchema = new Schema(
  {
    action: { type: String, required: true },
    fromStatus: { type: String, enum: ["FIRST_PENDING","SECOND_PENDING","APPROVED","RETURNED"], required: true },
    toStatus: { type: String, enum: ["FIRST_PENDING","SECOND_PENDING","APPROVED","RETURNED"], required: true },
    actorUserId: { type: Schema.Types.ObjectId, required: true },
    note: { type: String, default: "" },
    at: { type: Date, default: () => new Date() }
  },
  { _id: false }
);

const ApprovalWorkflowSchema = new Schema(
  {
    status: { type: String, enum: ["FIRST_PENDING","SECOND_PENDING","APPROVED","RETURNED"], default: "FIRST_PENDING" },
    requiresSecondApproval: { type: Boolean, default: false },
    note: { type: String, default: "" },
    history: { type: [ApprovalHistorySchema], default: [] },
    updatedAt: { type: Date, default: () => new Date() }
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
          productCode: String,
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

    approvalWorkflow: { type: ApprovalWorkflowSchema, default: () => ({}) },

    idpIntelligencePolicy: {
      version: { type: String, enum: ["1"] },
      coverageProfile: Schema.Types.Mixed,
      consistencyProfile: Schema.Types.Mixed
    },

    idpIntelligence: {
      version: { type: String, enum: ["1"] },
      assessmentRunId: { type: Schema.Types.ObjectId, ref: "DeclarationIntelligenceAssessmentRun" },
      status: { type: String, enum: ["READY", "REVIEW_REQUIRED", "INVALID_CONFIGURATION"] },
      issues: { type: [Schema.Types.Mixed], default: [] },
      assessedAt: Date
    },

    idpLlmAssistPolicy: {
      version: { type: String, enum: ["1"] },
      enabled: { type: Boolean, default: false },
      autoApplyResolvedAuthority: { type: Boolean, default: false }
    },

    idpLlmAssist: {
      version: { type: String, enum: ["1"] },
      assistRunId: { type: Schema.Types.ObjectId, ref: "DeclarationLlmAssistRun" },
      assessmentRunId: { type: Schema.Types.ObjectId, ref: "DeclarationIntelligenceAssessmentRun" },
      decision: { type: String, enum: ["RESOLVED", "REVIEW_REQUIRED"] },
      selections: { type: [Schema.Types.Mixed], default: [] },
      issues: { type: [Schema.Types.Mixed], default: [] },
      model: String,
      provider: String,
      assistedAt: Date
    },

    idpResolution: {
      version: { type: String, enum: ["1"] },
      resolutionRunId: { type: Schema.Types.ObjectId, ref: "DeclarationFieldResolutionRun" },
      reviewRequiredFields: { type: [String], default: [] },
      fields: Schema.Types.Mixed,
      resolvedAt: Date
    },

    createdBy: { type: Schema.Types.ObjectId }
  },
  { timestamps: true }
);

export const DeclarationModel: mongoose.Model<DeclarationDoc> =
  (mongoose.models.Declaration as mongoose.Model<DeclarationDoc> | undefined) ??
  mongoose.model<DeclarationDoc>("Declaration", DeclarationSchema);
