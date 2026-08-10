import type { DeclarationDoc, OperationMetaDoc } from "./declaration.model.js";

export interface OperationMetaDto {
  ref: string;
  customerId?: string;
  customerName: string;
  customerCity: string;
  fileStatus: string;
  operationType: string;
  isArchived: boolean;
  transportMode: string | null;
  line: string | null;
  declarationNo: string | null;
  tescilNo: string | null;
  assigneeName: string | null;
  escalation: boolean;
  missingDocuments: string[];
  lastActivity: string;
  closedAt: string | null;
  receivedAt: string;
  tescilStatus: string | null;
  tescilRisk: string;
  hasSecondNotif: boolean;
  tescilDays: number;
  kapanisStatus: string | null;
  tescilDurumu: string;
  kapanicDurumu: string;
  mailRecipient: string;
  mailSubject: string;
  mailBody: string;
}

export interface DeclarationDto {
  _id: string;
  companyId: string;
  status: string;
  operation?: OperationMetaDto;
  normalizedData?: unknown;
  sourceTrace?: DeclarationDoc["sourceTrace"];
  generatedXmlPath?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

function toIso(d: Date | string | undefined | null): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toOperationDto(op?: OperationMetaDoc): OperationMetaDto | undefined {
  if (!op) return undefined;
  return {
    ref: op.ref,
    customerId: op.customerId,
    customerName: op.customerName ?? "—",
    customerCity: op.customerCity ?? "—",
    fileStatus: op.fileStatus ?? "yeni-talep",
    operationType: op.operationType ?? "ihracat",
    isArchived: Boolean(op.isArchived),
    transportMode: op.transportMode ?? null,
    line: op.line ?? null,
    declarationNo: op.declarationNo ?? null,
    tescilNo: op.tescilNo ?? null,
    assigneeName: op.assigneeName ?? null,
    escalation: Boolean(op.escalation),
    missingDocuments: op.missingDocuments ?? [],
    lastActivity: op.lastActivity ?? "Oluşturuldu",
    closedAt: toIso(op.closedAt),
    receivedAt: toIso(op.receivedAt) ?? new Date().toISOString(),
    tescilStatus: op.tescilStatus ?? null,
    tescilRisk: op.tescilRisk ?? "",
    hasSecondNotif: Boolean(op.hasSecondNotif),
    tescilDays: op.tescilDays ?? 0,
    kapanisStatus: op.kapanisStatus ?? null,
    tescilDurumu: op.tescilDurumu ?? "",
    kapanicDurumu: op.kapanicDurumu ?? "",
    mailRecipient: op.mailRecipient ?? "",
    mailSubject: op.mailSubject ?? "",
    mailBody: op.mailBody ?? ""
  };
}

export function toDeclarationDto(doc: DeclarationDoc | Record<string, unknown>): DeclarationDto {
  const d = doc as DeclarationDoc & { _id: { toString(): string }; companyId: { toString(): string } };
  return {
    _id: String(d._id),
    companyId: String(d.companyId),
    status: d.status,
    operation: toOperationDto(d.operation),
    normalizedData: d.normalizedData,
    sourceTrace: d.sourceTrace,
    generatedXmlPath: d.generatedXmlPath,
    createdBy: d.createdBy ? String(d.createdBy) : undefined,
    createdAt: toIso(d.createdAt) ?? undefined,
    updatedAt: toIso(d.updatedAt) ?? undefined
  };
}
