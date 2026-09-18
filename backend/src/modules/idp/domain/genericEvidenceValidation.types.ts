export const GenericEvidenceValidationStatus = {
  VALID: "VALID",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;

export type GenericEvidenceValidationStatusValue = typeof GenericEvidenceValidationStatus[keyof typeof GenericEvidenceValidationStatus];

export type GenericEvidenceReasonCode =
  | "MISSING_REQUIRED_FIELD"
  | "MISSING_EVIDENCE"
  | "INVALID_EVIDENCE_PAGE"
  | "INVALID_EVIDENCE_BBOX"
  | "EVIDENCE_NOT_SUPPORTED_BY_CANONICAL"
  | "DERIVED_PRODUCT_CODE_NOT_TRACEABLE"
  | "ARITHMETIC_MISMATCH";

export interface GenericEvidenceValidationIssue {
  rowIndex: number;
  field?: string;
  code: GenericEvidenceReasonCode;
  message: string;
}

export interface GenericEvidenceRowValidation {
  rowIndex: number;
  status: GenericEvidenceValidationStatusValue;
  issues: GenericEvidenceValidationIssue[];
}

export interface GenericEvidenceValidationResult {
  version: "1";
  status: GenericEvidenceValidationStatusValue;
  rows: GenericEvidenceRowValidation[];
  summary: {
    rowCount: number;
    validRowCount: number;
    reviewRequiredRowCount: number;
    issueCount: number;
    reasonCounts: Partial<Record<GenericEvidenceReasonCode, number>>;
  };
}
