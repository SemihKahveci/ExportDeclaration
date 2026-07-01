import mongoose, { Schema } from "mongoose";

export const APP_USER_ROLES = [
  "Admin",
  "Yönetici",
  "MT Yönetici",
  "Operasyon",
  "MT",
  "Saha"
] as const;

export const APP_USER_STATUSES = ["Aktif", "Pasif"] as const;
export const APPROVER_LEVELS = ["none", "first", "second"] as const;

export interface AppUserDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  role: (typeof APP_USER_ROLES)[number];
  status: (typeof APP_USER_STATUSES)[number];
  capabilities: string[];
  operationTypes: string[];
  menuAccess: string[];
  menuActions: Record<string, string[]>;
  approverLevel: (typeof APPROVER_LEVELS)[number];
  specialActions: string[];
  screenPermissions?: Record<string, { view: boolean; operate: boolean }>;
  createdAt: Date;
  updatedAt: Date;
}

const AppUserSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, enum: APP_USER_ROLES, required: true },
    status: { type: String, enum: APP_USER_STATUSES, default: "Aktif" },
    capabilities: { type: [String], default: [] },
    operationTypes: { type: [String], default: [] },
    menuAccess: { type: [String], default: [] },
    menuActions: { type: Schema.Types.Mixed, default: {} },
    approverLevel: { type: String, enum: APPROVER_LEVELS, default: "none" },
    specialActions: { type: [String], default: [] },
    screenPermissions: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

AppUserSchema.index({ companyId: 1, email: 1 }, { unique: true });

export const AppUserModel =
  mongoose.models.AppUser ?? mongoose.model<AppUserDoc>("AppUser", AppUserSchema);
