import type { ClassifiedDocumentTypeValue } from "./segmentClassification.types.js";

export const ValidationStatus = {
  VALID: "VALID",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;
export type ValidationStatusValue = (typeof ValidationStatus)[keyof typeof ValidationStatus];

export const ValidationSeverity = {
  ERROR: "ERROR",
  WARNING: "WARNING"
} as const;
export type ValidationSeverityValue = (typeof ValidationSeverity)[keyof typeof ValidationSeverity];

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverityValue;
  message: string;
  path?: string;
  lineNo?: number;
  evidence?: Record<string, unknown>;
}

export interface ValidationEnvelope {
  version: "1";
  status: ValidationStatusValue;
  documentType: ClassifiedDocumentTypeValue | null;
  validator: string | null;
  issues: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
}
