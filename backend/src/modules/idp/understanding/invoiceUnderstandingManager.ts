import type { InvoiceUnderstanding, InvoiceUnderstandingIssue } from "./invoiceUnderstanding.types.js";
import type { InvoiceSpecialistResult } from "./invoiceUnderstandingSpecialistResult.js";

export type InvoiceUnderstandingAssembly = {
  understanding: InvoiceUnderstanding;
  specialistStatuses: Record<string, string>;
};

/**
 * Structural assembly only. This is NOT reconciliation: conflicts, semantic judging and targeted
 * recovery belong to Foundation 8.4. Domain payloads cannot overwrite one another here because
 * each specialist result has a domain-specific payload type.
 */
export function assembleInvoiceUnderstanding(
  documentId: string,
  results: InvoiceSpecialistResult[]
): InvoiceUnderstandingAssembly {
  const byDomain = new Map(results.map(result => [result.domain, result]));
  if (byDomain.size !== results.length) throw new Error("Duplicate specialist domain result");

  const parties = byDomain.get("PARTIES") as InvoiceSpecialistResult<"PARTIES"> | undefined;
  const commercial = byDomain.get("COMMERCIAL") as InvoiceSpecialistResult<"COMMERCIAL"> | undefined;
  const goods = byDomain.get("GOODS") as InvoiceSpecialistResult<"GOODS"> | undefined;
  const logistics = byDomain.get("LOGISTICS") as InvoiceSpecialistResult<"LOGISTICS"> | undefined;

  const issues: InvoiceUnderstandingIssue[] = results.flatMap(result => result.issues);
  const statuses = results.map(result => result.status);
  const decision = statuses.includes("REVIEW_REQUIRED")
    ? "REVIEW_REQUIRED"
    : statuses.includes("PARTIAL") || results.length < 4
      ? "PARTIAL"
      : "UNDERSTOOD";

  return {
    understanding: {
      version: "1",
      documentId,
      decision,
      documentIdentity: commercial?.payload.documentIdentity ?? {},
      parties: parties?.payload.parties ?? {},
      commercialTerms: commercial?.payload.commercialTerms ?? {},
      logistics: logistics?.payload.logistics ?? {},
      packageSummary: logistics?.payload.packageSummary ?? {},
      goodsTable: goods?.payload.goodsTable ?? { tableEvidence: [], rows: [] },
      issues
    },
    specialistStatuses: Object.fromEntries(results.map(result => [result.domain, result.status]))
  };
}
