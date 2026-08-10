import type { NormalizedDeclaration } from "./document.types";

export type DeclarationStatus = "DRAFT" | "READY" | "XML_GENERATED" | "ERROR";

export interface OperationMeta {
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

export interface SourceTraceEntry {
  value: unknown;
  source: string | null;
}

export interface Declaration {
  _id: string;
  companyId: string;
  status: DeclarationStatus;
  operation?: OperationMeta;
  normalizedData?: NormalizedDeclaration;
  sourceTrace?: Record<string, SourceTraceEntry>;
  generatedXmlPath?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
