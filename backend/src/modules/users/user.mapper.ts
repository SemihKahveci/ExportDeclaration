import type { AppUserDoc } from "./user.model.js";

export interface AppUserDto {
  id: string;
  name: string;
  email: string;
  role: AppUserDoc["role"];
  status: AppUserDoc["status"];
  capabilities: string[];
  operationTypes: string[];
  menuAccess: string[];
  menuActions: Record<string, string[]>;
  approverLevel: AppUserDoc["approverLevel"];
  specialActions: string[];
  screenPermissions?: Record<string, { view: boolean; operate: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export function toAppUserDto(doc: AppUserDoc): AppUserDto {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    status: doc.status,
    capabilities: doc.capabilities ?? [],
    operationTypes: doc.operationTypes ?? [],
    menuAccess: doc.menuAccess ?? [],
    menuActions: doc.menuActions ?? {},
    approverLevel: doc.approverLevel ?? "none",
    specialActions: doc.specialActions ?? [],
    screenPermissions: doc.screenPermissions ?? {},
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
}
