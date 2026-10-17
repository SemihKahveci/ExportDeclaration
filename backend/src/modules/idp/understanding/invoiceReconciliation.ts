import {
  InvoiceUnderstandingDecision,
  checkGoodsRowArithmetic,
  validateInvoiceUnderstanding,
  type InvoiceUnderstanding,
  type InvoiceUnderstandingIssue
} from "./index.js";

export type ReconciliationAction = "ACCEPT" | "TARGETED_RECOVERY" | "REVIEW_REQUIRED";
export type RecoveryDomain = "PARTIES" | "COMMERCIAL" | "GOODS" | "LOGISTICS";

export interface TargetedRecoveryRequest {
  domain: RecoveryDomain;
  reasonCodes: string[];
  rowIds?: string[];
  instructions: string[];
}

export interface InvoiceReconciliationResult {
  action: ReconciliationAction;
  understanding: InvoiceUnderstanding;
  issues: InvoiceUnderstandingIssue[];
  recoveryRequests: TargetedRecoveryRequest[];
}

export function reconcileInvoiceUnderstanding(
  input: InvoiceUnderstanding,
  options: { requiredGoodsFields?: readonly ("productCode"|"description"|"hsCode"|"quantity"|"unit"|"unitPrice"|"lineTotal"|"origin")[] } = {}
): InvoiceReconciliationResult {
  const understanding: InvoiceUnderstanding = structuredClone(input);
  const validation = validateInvoiceUnderstanding(understanding, {
    requiredGoodsFields: options.requiredGoodsFields
  });
  const issues: InvoiceUnderstandingIssue[] = [...understanding.issues];
  const recoveryRequests: TargetedRecoveryRequest[] = [];

  if (!validation.valid) {
    issues.push({ code: "UNDERSTANDING_CONTRACT_INVALID", message: validation.errors.join("; "), scope: "DOCUMENT" });
    understanding.decision = InvoiceUnderstandingDecision.REVIEW_REQUIRED;
    understanding.issues = issues;
    return { action: "REVIEW_REQUIRED", understanding, issues, recoveryRequests };
  }

  const incompleteRows = validation.goodsRows.filter(row => !row.complete);
  if (incompleteRows.length > 0 || !validation.goodsTableComplete) {
    const rowIds = incompleteRows.map(row => row.rowId);
    issues.push({ code: "GOODS_ROWS_INCOMPLETE", message: `Atomic goods table is incomplete; incomplete rows: ${rowIds.join(", ") || "count mismatch"}`, scope: "GOODS_TABLE" });
    recoveryRequests.push({
      domain: "GOODS",
      reasonCodes: ["GOODS_ROWS_INCOMPLETE"],
      rowIds,
      instructions: [
        "Re-read only the unresolved goods rows/table continuation evidence.",
        "Preserve row identity; do not create a row from an HS/GTIP token alone.",
        "Do not borrow quantity, unit, price or amount from another row or from package summary."
      ]
    });
  }

  const arithmeticConflicts: string[] = [];
  for (const row of understanding.goodsTable.rows) {
    const arithmetic = checkGoodsRowArithmetic(row);
    if (arithmetic.checkable && arithmetic.consistent === false) {
      arithmeticConflicts.push(row.rowId);
      issues.push({ code: "GOODS_ARITHMETIC_CONFLICT", message: `Grounded quantity × unitPrice conflicts with grounded lineTotal for ${row.rowId}; delta=${arithmetic.delta}`, scope: "GOODS_ROW", rowId: row.rowId });
    }
  }
  if (arithmeticConflicts.length > 0) {
    recoveryRequests.push({
      domain: "GOODS",
      reasonCodes: ["GOODS_ARITHMETIC_CONFLICT"],
      rowIds: arithmeticConflicts,
      instructions: [
        "Re-read the conflicting row values from source evidence.",
        "Arithmetic may identify a conflict but must not calculate or replace the source value."
      ]
    });
  }

  const specialistReview = issues.some(issue => issue.code === "SPECIALIST_REVIEW_REQUIRED" || issue.code === "AMBIGUOUS_SOURCE_REQUIRES_REVIEW");
  if (specialistReview) {
    understanding.decision = InvoiceUnderstandingDecision.REVIEW_REQUIRED;
    understanding.issues = issues;
    return { action: "REVIEW_REQUIRED", understanding, issues, recoveryRequests: [] };
  }
  if (recoveryRequests.length > 0) {
    understanding.decision = InvoiceUnderstandingDecision.PARTIAL;
    understanding.issues = issues;
    return { action: "TARGETED_RECOVERY", understanding, issues, recoveryRequests };
  }
  understanding.decision = InvoiceUnderstandingDecision.UNDERSTOOD;
  understanding.issues = issues;
  return { action: "ACCEPT", understanding, issues, recoveryRequests };
}

export function applyTargetedRecovery(current: InvoiceUnderstanding, domain: RecoveryDomain, recovered: Partial<InvoiceUnderstanding>): InvoiceUnderstanding {
  const next = structuredClone(current);
  switch (domain) {
    case "PARTIES": if (recovered.parties) next.parties = structuredClone(recovered.parties); break;
    case "COMMERCIAL":
      if (recovered.documentIdentity) next.documentIdentity = structuredClone(recovered.documentIdentity);
      if (recovered.commercialTerms) next.commercialTerms = structuredClone(recovered.commercialTerms);
      break;
    case "GOODS": if (recovered.goodsTable) next.goodsTable = structuredClone(recovered.goodsTable); break;
    case "LOGISTICS":
      if (recovered.logistics) next.logistics = structuredClone(recovered.logistics);
      if (recovered.packageSummary) next.packageSummary = structuredClone(recovered.packageSummary);
      break;
  }
  return next;
}
