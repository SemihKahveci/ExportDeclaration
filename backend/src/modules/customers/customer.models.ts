import mongoose, { Schema } from "mongoose";

export interface CustomerDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  initials: string;
  country: string;
  assignedMtUserId?: string;
  assignedMtManagerUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    initials: { type: String, required: true, trim: true },
    country: { type: String, default: "Türkiye", trim: true },
    assignedMtUserId: { type: String, default: undefined },
    assignedMtManagerUserId: { type: String, default: undefined }
  },
  { timestamps: true }
);

CustomerSchema.index({ companyId: 1, name: 1 });

export const CustomerModel =
  mongoose.models.Customer ?? mongoose.model<CustomerDoc>("Customer", CustomerSchema);

export const EVRIM_STATUSES = ["local", "sent", "pending"] as const;

export interface CustomerAddressDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  company: string;
  addressLines: string;
  city: string;
  country: string;
  taxNo: string;
  evrimStatus: (typeof EVRIM_STATUSES)[number];
  changed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerAddressSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    company: { type: String, required: true, trim: true },
    addressLines: { type: String, required: true },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    taxNo: { type: String, default: "" },
    evrimStatus: { type: String, enum: EVRIM_STATUSES, default: "local" },
    changed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

CustomerAddressSchema.index({ companyId: 1, customerId: 1 });

export const CustomerAddressModel =
  mongoose.models.CustomerAddress ??
  mongoose.model<CustomerAddressDoc>("CustomerAddress", CustomerAddressSchema);

export interface CustomerMailDomainDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  domain: string;
  matchStatus: "active" | "passive";
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerMailDomainSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    domain: { type: String, required: true, trim: true },
    matchStatus: { type: String, enum: ["active", "passive"], default: "active" },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

CustomerMailDomainSchema.index({ companyId: 1, customerId: 1 });

export const CustomerMailDomainModel =
  mongoose.models.CustomerMailDomain ??
  mongoose.model<CustomerMailDomainDoc>("CustomerMailDomain", CustomerMailDomainSchema);

export interface CustomerMailDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  email: string;
  domain: string;
  owner: string;
  matchStatus: "active" | "passive";
  notificationProcesses: string[];
  status: "active" | "passive";
  createdAt: Date;
  updatedAt: Date;
}

const CustomerMailSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    domain: { type: String, default: "" },
    owner: { type: String, default: "" },
    matchStatus: { type: String, enum: ["active", "passive"], default: "active" },
    notificationProcesses: { type: [String], default: [] },
    status: { type: String, enum: ["active", "passive"], default: "active" }
  },
  { timestamps: true }
);

CustomerMailSchema.index({ companyId: 1, customerId: 1 });

export const CustomerMailModel =
  mongoose.models.CustomerMail ??
  mongoose.model<CustomerMailDoc>("CustomerMail", CustomerMailSchema);

export const DOC_RULE_REMINDER_TYPES = ["Otomatik", "Kontrollü", "Manuel"] as const;

export interface CustomerDocumentRuleDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  transactionType: string;
  transportMode: string;
  scenario: string;
  requiredDocs: string[];
  reminderType: (typeof DOC_RULE_REMINDER_TYPES)[number];
  frequency: string;
  status: "Aktif" | "Pasif";
  createdAt: Date;
  updatedAt: Date;
}

const CustomerDocumentRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    transactionType: { type: String, required: true },
    transportMode: { type: String, required: true },
    scenario: { type: String, default: "" },
    requiredDocs: { type: [String], default: [] },
    reminderType: { type: String, enum: DOC_RULE_REMINDER_TYPES, default: "Otomatik" },
    frequency: { type: String, default: "" },
    status: { type: String, enum: ["Aktif", "Pasif"], default: "Aktif" }
  },
  { timestamps: true }
);

CustomerDocumentRuleSchema.index({ companyId: 1, customerId: 1 });

export const CustomerDocumentRuleModel =
  mongoose.models.CustomerDocumentRule ??
  mongoose.model<CustomerDocumentRuleDoc>("CustomerDocumentRule", CustomerDocumentRuleSchema);

export const NOTIFY_WORKING_MODES = ["Otomatik", "Kontrollü", "Manuel", "Kapalı"] as const;

export interface CustomerNotificationRuleDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  process: string;
  workingMode: (typeof NOTIFY_WORKING_MODES)[number];
  channels: string[];
  recipientRule: string;
  requiresApproval: boolean;
  status: "Aktif" | "Pasif";
  createdAt: Date;
  updatedAt: Date;
}

const CustomerNotificationRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    process: { type: String, required: true },
    workingMode: { type: String, enum: NOTIFY_WORKING_MODES, default: "Otomatik" },
    channels: { type: [String], default: [] },
    recipientRule: { type: String, default: "" },
    requiresApproval: { type: Boolean, default: false },
    status: { type: String, enum: ["Aktif", "Pasif"], default: "Aktif" }
  },
  { timestamps: true }
);

CustomerNotificationRuleSchema.index({ companyId: 1, customerId: 1 });

export const CustomerNotificationRuleModel =
  mongoose.models.CustomerNotificationRule ??
  mongoose.model<CustomerNotificationRuleDoc>(
    "CustomerNotificationRule",
    CustomerNotificationRuleSchema
  );

export const DECL_FIELD_CONFLICT_ACTIONS = [
  "Ana kaynak öncelikli",
  "Kullanıcıya göster",
  "Müşteriye sor",
  "Manuel karar iste"
] as const;

export interface DeclarationFieldRuleDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  fieldGroup: string;
  fieldName: string;
  primarySource: string;
  fallbackSource: string;
  conflictAction: (typeof DECL_FIELD_CONFLICT_ACTIONS)[number];
  status: "Aktif" | "Pasif";
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeclarationFieldRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    fieldGroup: { type: String, required: true },
    fieldName: { type: String, required: true },
    primarySource: { type: String, default: "" },
    fallbackSource: { type: String, default: "" },
    conflictAction: {
      type: String,
      enum: DECL_FIELD_CONFLICT_ACTIONS,
      default: "Ana kaynak öncelikli"
    },
    status: { type: String, enum: ["Aktif", "Pasif"], default: "Aktif" },
    description: { type: String, default: "" }
  },
  { timestamps: true }
);

DeclarationFieldRuleSchema.index({ companyId: 1, customerId: 1 });

export const DeclarationFieldRuleModel =
  mongoose.models.DeclarationFieldRule ??
  mongoose.model<DeclarationFieldRuleDoc>("DeclarationFieldRule", DeclarationFieldRuleSchema);
