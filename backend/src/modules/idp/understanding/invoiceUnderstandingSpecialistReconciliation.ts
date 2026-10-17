import { InvoiceLlmExtractionDecision } from "../domain/invoiceLlmExtraction.types.js";
import { reconcileInvoiceUnderstanding, type InvoiceReconciliationResult } from "./invoiceReconciliation.js";
import { projectSpecialistModelAuditToInvoiceUnderstanding } from "./invoiceUnderstandingSpecialistProjection.js";
import type { Foundation8SpecialistModelExecutionAudit } from "./invoiceUnderstandingSpecialistModelExecution.js";

export const FOUNDATION8_SPECIALIST_RECONCILIATION_VERSION = "8.12.0" as const;

export interface Foundation8SpecialistReconciliationAudit {
  version: typeof FOUNDATION8_SPECIALIST_RECONCILIATION_VERSION;
  mode: "SHADOW_ONLY";
  productionCandidateMutation: false;
  action: InvoiceReconciliationResult["action"];
  issueCodes: string[];
  recoveryDomains: string[];
  recoveryRowIds: string[];
  result: InvoiceReconciliationResult;
}

/**
 * Converts bounded specialist model output into one atomic InvoiceUnderstanding and
 * runs the Foundation 8 reconciliation policy. This remains audit-only: no
 * FieldCandidate, Foundation 6 resolution, or normalizedData mutation is possible.
 */
export function reconcileFoundation8SpecialistModelShadow(params: {
  documentId: string;
  audit: Foundation8SpecialistModelExecutionAudit;
}): Foundation8SpecialistReconciliationAudit {
  const understanding = projectSpecialistModelAuditToInvoiceUnderstanding(params);

  const reviewSpecialists = params.audit.specialists.filter(item =>
    item.status === "FAILED" || item.response?.decision === InvoiceLlmExtractionDecision.REVIEW_REQUIRED
  );
  if (reviewSpecialists.length > 0) {
    understanding.issues.push({
      code: "SPECIALIST_REVIEW_REQUIRED",
      message: `Specialist review required: ${reviewSpecialists.map(item => item.domain).join(", ")}`,
      scope: "DOCUMENT"
    });
  }

  const result = reconcileInvoiceUnderstanding(understanding);
  return {
    version: FOUNDATION8_SPECIALIST_RECONCILIATION_VERSION,
    mode: "SHADOW_ONLY",
    productionCandidateMutation: false,
    action: result.action,
    issueCodes: [...new Set(result.issues.map(issue => issue.code))],
    recoveryDomains: [...new Set(result.recoveryRequests.map(request => request.domain))],
    recoveryRowIds: [...new Set(result.recoveryRequests.flatMap(request => request.rowIds ?? []))],
    result
  };
}
