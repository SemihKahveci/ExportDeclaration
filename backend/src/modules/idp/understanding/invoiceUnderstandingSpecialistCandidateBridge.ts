import type { FieldCandidate, FieldCandidateEnvelope, FieldCandidateEvidence } from "../domain/fieldCandidate.types.js";
import { checkGoodsRowArithmetic, validateInvoiceUnderstanding } from "./invoiceUnderstandingContract.js";
import type { GroundedValue, InvoiceUnderstanding, InvoiceUnderstandingEvidenceRef } from "./invoiceUnderstanding.types.js";
import type { Foundation8SpecialistReconciliationAudit } from "./invoiceUnderstandingSpecialistReconciliation.js";

export const FOUNDATION8_RECONCILED_CANDIDATE_BRIDGE_VERSION = "8.16.0" as const;

function evidenceOf(segmentId: string, refs: readonly InvoiceUnderstandingEvidenceRef[]): FieldCandidateEvidence[] {
  return refs.flatMap(ref => {
    if (ref.source !== "NATIVE_TEXT" && ref.source !== "OCR") return [];
    if (!ref.quote?.trim()) return [];
    return [{ segmentId, pageNumber: ref.pageNumber, text: ref.quote.trim(), contentSource: ref.source }];
  });
}

function addGrounded(
  envelope: FieldCandidateEnvelope,
  segmentId: string,
  field: string,
  grounded: GroundedValue<unknown> | undefined,
  validate?: (value: unknown) => boolean
): void {
  if (!grounded || (validate && !validate(grounded.value))) return;
  const evidence = evidenceOf(segmentId, grounded.evidence);
  if (!evidence.length) return;
  const candidate: FieldCandidate = {
    candidateId: `f8:${segmentId}:${field}:f8-reconciled`,
    field,
    value: grounded.value,
    confidence: grounded.confidence,
    extractor: "foundation8-reconciled-specialist",
    evidence
  };
  envelope.fields[field] = [candidate];
}

const exactTwelveDigitHs = (value: unknown) => /^\d{12}$/.test(String(value ?? "").replace(/\D/g, ""));
const nonEmpty = (value: unknown) => typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;

/**
 * Converts only page-grounded, reconciled specialist semantics into Foundation 6 candidates.
 * This is the explicit Foundation 8 cutover boundary. Golden answers and supplier-specific
 * rules are intentionally absent. Existing production candidates remain fallback for fields
 * that specialists do not safely establish.
 */
export function bridgeReconciledFoundation8ToCandidates(params: {
  segmentId: string;
  reconciliation: Foundation8SpecialistReconciliationAudit;
  /** 8.17 domain-local safety: a failed GOODS specialist must not discard grounded PARTIES/COMMERCIAL/LOGISTICS. */
  promotableDomains?: ReadonlySet<"PARTIES" | "COMMERCIAL" | "GOODS" | "LOGISTICS">;
}): FieldCandidateEnvelope {
  const out: FieldCandidateEnvelope = { version: "1", fields: {} };
  const u: InvoiceUnderstanding = params.reconciliation.result.understanding;
  const domains = params.promotableDomains ?? (params.reconciliation.action === "REVIEW_REQUIRED"
    ? new Set<"PARTIES" | "COMMERCIAL" | "GOODS" | "LOGISTICS">()
    : new Set<"PARTIES" | "COMMERCIAL" | "GOODS" | "LOGISTICS">(["PARTIES", "COMMERCIAL", "GOODS", "LOGISTICS"]));

  if (domains.has("COMMERCIAL")) {
  addGrounded(out, params.segmentId, "invoiceNo", u.documentIdentity.invoiceNo, nonEmpty);
  addGrounded(out, params.segmentId, "invoiceDate", u.documentIdentity.invoiceDate, nonEmpty);
  addGrounded(out, params.segmentId, "currency", u.commercialTerms.currency, nonEmpty);
  addGrounded(out, params.segmentId, "totalAmount", u.commercialTerms.totalAmount);
  addGrounded(out, params.segmentId, "exchangeRate", u.commercialTerms.exchangeRate);
  addGrounded(out, params.segmentId, "paymentType", u.commercialTerms.paymentTerm, nonEmpty);
  addGrounded(out, params.segmentId, "bankInfo", u.commercialTerms.bankDetails, nonEmpty);
  }

  if (domains.has("PARTIES")) {
  addGrounded(out, params.segmentId, "parties.seller.name", u.parties.seller?.name, nonEmpty);
  addGrounded(out, params.segmentId, "parties.seller.address", u.parties.seller?.address, nonEmpty);
  addGrounded(out, params.segmentId, "parties.seller.country", u.parties.seller?.country, nonEmpty);
  addGrounded(out, params.segmentId, "parties.buyer.name", u.parties.buyer?.name, nonEmpty);
  addGrounded(out, params.segmentId, "parties.buyer.address", u.parties.buyer?.address, nonEmpty);
  addGrounded(out, params.segmentId, "parties.buyer.country", u.parties.buyer?.country, nonEmpty);
  }

  if (domains.has("LOGISTICS")) {
  addGrounded(out, params.segmentId, "deliveryTerm", u.logistics.deliveryTerm, nonEmpty);
  addGrounded(out, params.segmentId, "transportMode", u.logistics.transportMode, nonEmpty);
  addGrounded(out, params.segmentId, "grossWeight", u.logistics.grossWeight);
  addGrounded(out, params.segmentId, "netWeight", u.logistics.netWeight);
  addGrounded(out, params.segmentId, "totalPackage", u.packageSummary.count);
  addGrounded(out, params.segmentId, "packageType", u.packageSummary.type, nonEmpty);
  }

  if (!domains.has("GOODS")) return out;
  const validation = validateInvoiceUnderstanding(u);
  const completeRows = new Set(validation.goodsRows.filter(row => row.complete).map(row => row.rowId));
  u.goodsTable.rows.forEach((row, arrayIndex) => {
    if (!completeRows.has(row.rowId)) return;
    const sourceIndex = /^model-row-(\d+)-p/.exec(row.rowId);
    const index = sourceIndex ? Number(sourceIndex[1]) : arrayIndex;
    const arithmetic = checkGoodsRowArithmetic(row);
    if (arithmetic.checkable && arithmetic.consistent === false) return;
    const prefix = `goodsLines.${index}.`;
    addGrounded(out, params.segmentId, `${prefix}productCode`, row.productCode, nonEmpty);
    addGrounded(out, params.segmentId, `${prefix}description`, row.description, nonEmpty);
    addGrounded(out, params.segmentId, `${prefix}hsCode`, row.hsCode, exactTwelveDigitHs);
    addGrounded(out, params.segmentId, `${prefix}quantity`, row.quantity);
    addGrounded(out, params.segmentId, `${prefix}unit`, row.unit, nonEmpty);
    addGrounded(out, params.segmentId, `${prefix}unitPrice`, row.unitPrice);
    addGrounded(out, params.segmentId, `${prefix}lineTotal`, row.lineTotal);
    addGrounded(out, params.segmentId, `${prefix}origin`, row.origin, nonEmpty);
  });

  return out;
}

/** Specialist semantics are authoritative only for the fields they safely bridged. */
export function overlayReconciledFoundation8Candidates(
  legacy: FieldCandidateEnvelope,
  foundation8: FieldCandidateEnvelope
): FieldCandidateEnvelope {
  const fields = { ...legacy.fields };
  for (const [field, candidates] of Object.entries(foundation8.fields)) {
    if (/^goodsLines\.\d+\./.test(field)) {
      // Atomic GOODS semantics deliberately replace field-index/page-image guesses.
      fields[field] = candidates;
      continue;
    }
    // For stable document scalars/parties/logistics, Foundation 8 is additive:
    // fill a production gap without erasing already-proven legacy authority.
    if (!(fields[field]?.length)) fields[field] = candidates;
  }
  return { version: "1", fields };
}
