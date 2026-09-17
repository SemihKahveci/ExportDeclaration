import type { CandidateResolutionEnvelope } from "../domain/candidateResolution.types.js";
import { CandidateResolutionStatus } from "../domain/candidateResolution.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";
import {
  ValidationSeverity,
  ValidationStatus,
  type ValidationEnvelope
} from "../domain/validation.types.js";
import { validateInvoiceCandidate } from "./invoiceValidator.js";

export function validateResolvedCandidate(
  resolution: CandidateResolutionEnvelope
): ValidationEnvelope {
  if (resolution.status !== CandidateResolutionStatus.RESOLVED || !resolution.data) {
    return {
      version: "1",
      status: ValidationStatus.REVIEW_REQUIRED,
      documentType: resolution.documentType,
      validator: null,
      issues: [{
        code: "VALIDATION_INPUT_NOT_RESOLVED",
        severity: ValidationSeverity.ERROR,
        message: "Validation yalnızca RESOLVED candidate üzerinde çalışabilir.",
        evidence: { resolutionStatus: resolution.status }
      }],
      summary: { errorCount: 1, warningCount: 0 }
    };
  }

  switch (resolution.documentType) {
    case ClassifiedDocumentType.INVOICE:
      return validateInvoiceCandidate(resolution.data);
    default:
      return {
        version: "1",
        status: ValidationStatus.REVIEW_REQUIRED,
        documentType: resolution.documentType,
        validator: null,
        issues: [{
          code: "VALIDATOR_NOT_REGISTERED",
          severity: ValidationSeverity.ERROR,
          message: `Document type için validator kayıtlı değil: ${resolution.documentType ?? "null"}.`
        }],
        summary: { errorCount: 1, warningCount: 0 }
      };
  }
}
