import type {
  CustomerAddressDoc,
  CustomerDoc,
  CustomerDocumentRuleDoc,
  CustomerMailDoc,
  CustomerMailDomainDoc,
  CustomerNotificationRuleDoc,
  DeclarationFieldRuleDoc
} from "./customer.models.js";

export interface CustomerDto {
  id: string;
  name: string;
  initials: string;
  meta: string;
  country: string;
  assignedMtUserId?: string;
  assignedMtManagerUserId?: string;
}

export interface CustomerAddressDto {
  id: string;
  customerId: string;
  company: string;
  addressLines: string;
  city: string;
  country: string;
  taxNo: string;
  evrimStatus: "local" | "sent" | "pending";
  changed: boolean;
}

export interface MailDomainDto {
  id: string;
  customerId: string;
  domain: string;
  matchStatus: "active" | "passive";
  note: string;
}

export interface CustomerMailDto {
  id: string;
  customerId: string;
  email: string;
  domain: string;
  owner: string;
  matchStatus: "active" | "passive";
  notificationProcesses: string[];
  status: "active" | "passive";
}

export interface DocumentRuleDto {
  id: string;
  customerId: string;
  transactionType: string;
  transportMode: string;
  scenario: string;
  requiredDocs: string[];
  reminderType: string;
  frequency: string;
  status: "Aktif" | "Pasif";
}

export interface NotificationRuleDto {
  id: string;
  customerId: string;
  process: string;
  workingMode: string;
  channels: string[];
  recipientRule: string;
  requiresApproval: boolean;
  status: "Aktif" | "Pasif";
}

export interface DeclarationFieldRuleDto {
  id: string;
  customerId: string;
  fieldGroup: string;
  fieldName: string;
  primarySource: string;
  fallbackSource: string;
  conflictAction: string;
  status: "Aktif" | "Pasif";
  description: string;
}

export function toCustomerDto(doc: CustomerDoc, addressCount = 0): CustomerDto {
  return {
    id: String(doc._id),
    name: doc.name,
    initials: doc.initials,
    meta: `${doc.country || "—"} · ${addressCount} adres`,
    country: doc.country || "Türkiye",
    assignedMtUserId: doc.assignedMtUserId || undefined,
    assignedMtManagerUserId: doc.assignedMtManagerUserId || undefined
  };
}

export function toAddressDto(doc: CustomerAddressDoc): CustomerAddressDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    company: doc.company,
    addressLines: doc.addressLines,
    city: doc.city,
    country: doc.country,
    taxNo: doc.taxNo,
    evrimStatus: doc.evrimStatus,
    changed: doc.changed
  };
}

export function toDomainDto(doc: CustomerMailDomainDoc): MailDomainDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    domain: doc.domain,
    matchStatus: doc.matchStatus,
    note: doc.note ?? ""
  };
}

export function toMailDto(doc: CustomerMailDoc): CustomerMailDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    email: doc.email,
    domain: doc.domain,
    owner: doc.owner ?? "",
    matchStatus: doc.matchStatus,
    notificationProcesses: doc.notificationProcesses ?? [],
    status: doc.status
  };
}

export function toDocumentRuleDto(doc: CustomerDocumentRuleDoc): DocumentRuleDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    transactionType: doc.transactionType,
    transportMode: doc.transportMode,
    scenario: doc.scenario ?? "",
    requiredDocs: doc.requiredDocs ?? [],
    reminderType: doc.reminderType,
    frequency: doc.frequency ?? "",
    status: doc.status
  };
}

export function toNotificationRuleDto(doc: CustomerNotificationRuleDoc): NotificationRuleDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    process: doc.process,
    workingMode: doc.workingMode,
    channels: doc.channels ?? [],
    recipientRule: doc.recipientRule ?? "",
    requiresApproval: Boolean(doc.requiresApproval),
    status: doc.status
  };
}

export function toDeclarationFieldRuleDto(doc: DeclarationFieldRuleDoc): DeclarationFieldRuleDto {
  return {
    id: String(doc._id),
    customerId: doc.customerId,
    fieldGroup: doc.fieldGroup,
    fieldName: doc.fieldName,
    primarySource: doc.primarySource ?? "",
    fallbackSource: doc.fallbackSource ?? "",
    conflictAction: doc.conflictAction,
    status: doc.status,
    description: doc.description ?? ""
  };
}

export function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
