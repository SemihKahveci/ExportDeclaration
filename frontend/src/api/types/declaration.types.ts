import type { NormalizedDeclaration } from "./document.types";

export type DeclarationStatus = "DRAFT" | "READY" | "XML_GENERATED" | "ERROR";

export interface SourceTraceEntry {
  value: unknown;
  source: string | null;
}

export interface Declaration {
  _id: string;
  companyId: string;
  status: DeclarationStatus;
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
