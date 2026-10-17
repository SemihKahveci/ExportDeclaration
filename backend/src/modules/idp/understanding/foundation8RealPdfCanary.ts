import type { CandidateExtractionEnvelope } from "../domain/candidateExtraction.types.js";

export const FOUNDATION8_REAL_PDF_CANARY_VERSION = "8.13.0" as const;

export interface Foundation8CanarySpecialistSummary {
  domain: string;
  status: string;
  decision?: string;
  elapsedMs?: number;
  returnedFieldCount: number;
  acceptedOwnedFieldCount: number;
  rejectedOutOfDomainFields: string[];
  error?: string;
}

export interface Foundation8CanarySegmentSummary {
  segmentId: string;
  pageNumbers: number[];
  specialistModelCallsAttempted: number;
  specialistTotalElapsedMs?: number;
  specialists: Foundation8CanarySpecialistSummary[];
  reconciliation?: {
    action?: string;
    issueCodes: string[];
    recoveryDomains: string[];
    recoveryRowIds: string[];
    atomicGoodsRowCount: number;
    completeAtomicGoodsRowCount: number;
  };
}

export interface Foundation8RealPdfCanarySummary {
  version: typeof FOUNDATION8_REAL_PDF_CANARY_VERSION;
  segments: Foundation8CanarySegmentSummary[];
  totals: {
    segmentsWithSpecialistAudit: number;
    modelCallsAttempted: number;
    atomicGoodsRows: number;
    completeAtomicGoodsRows: number;
    actions: Record<string, number>;
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function completeAtomicRow(row: unknown): boolean {
  if (!isObject(row)) return false;
  const hasIdentity = Boolean(row.productCode || row.description);
  const hasCommercialQuantity = Boolean(row.quantity && row.unit);
  const hasCommercialValue = Boolean(row.unitPrice || row.lineTotal);
  return hasIdentity && hasCommercialQuantity && hasCommercialValue && Array.isArray(row.rowEvidence) && row.rowEvidence.length > 0;
}

/**
 * Converts the persisted production candidate envelope into a compact canary report.
 * It reads Foundation 8 shadow audit only; it never imports golden answers and cannot
 * mutate production candidates, F6 resolution or normalizedData.
 */
export function summarizeFoundation8RealPdfCanary(extraction: CandidateExtractionEnvelope): Foundation8RealPdfCanarySummary {
  const segments: Foundation8CanarySegmentSummary[] = [];

  for (const segment of extraction.segments) {
    const data = segment.data;
    const specialist = data?.foundation8SpecialistModelAudit;
    if (!isObject(specialist) || !Array.isArray(specialist.specialists)) continue;
    const reconciliation = data?.foundation8SpecialistReconciliationAudit;
    const result = isObject(reconciliation) && isObject(reconciliation.result) ? reconciliation.result : undefined;
    const understanding = result && isObject(result.understanding) ? result.understanding : undefined;
    const goodsTable = understanding && isObject(understanding.goodsTable) ? understanding.goodsTable : undefined;
    const rows = goodsTable && Array.isArray(goodsTable.rows) ? goodsTable.rows : [];

    segments.push({
      segmentId: segment.segmentId,
      pageNumbers: [...segment.pageNumbers],
      specialistModelCallsAttempted: Number(specialist.modelCallsAttempted ?? 0),
      specialistTotalElapsedMs: typeof specialist.totalElapsedMs === "number" ? specialist.totalElapsedMs : undefined,
      specialists: specialist.specialists.map((item: any) => ({
        domain: String(item.domain ?? "UNKNOWN"),
        status: String(item.status ?? "UNKNOWN"),
        decision: typeof item.decision === "string" ? item.decision : undefined,
        elapsedMs: typeof item.elapsedMs === "number" ? item.elapsedMs : undefined,
        returnedFieldCount: Number(item.returnedFieldCount ?? 0),
        acceptedOwnedFieldCount: Number(item.acceptedOwnedFieldCount ?? 0),
        rejectedOutOfDomainFields: Array.isArray(item.rejectedOutOfDomainFields) ? item.rejectedOutOfDomainFields.map(String) : [],
        error: typeof item.error === "string" ? item.error : undefined
      })),
      reconciliation: isObject(reconciliation) ? {
        action: typeof reconciliation.action === "string" ? reconciliation.action : undefined,
        issueCodes: Array.isArray(reconciliation.issueCodes) ? reconciliation.issueCodes.map(String) : [],
        recoveryDomains: Array.isArray(reconciliation.recoveryDomains) ? reconciliation.recoveryDomains.map(String) : [],
        recoveryRowIds: Array.isArray(reconciliation.recoveryRowIds) ? reconciliation.recoveryRowIds.map(String) : [],
        atomicGoodsRowCount: rows.length,
        completeAtomicGoodsRowCount: rows.filter(completeAtomicRow).length
      } : undefined
    });
  }

  const actions: Record<string, number> = {};
  for (const segment of segments) {
    const action = segment.reconciliation?.action ?? "NO_RECONCILIATION";
    actions[action] = (actions[action] ?? 0) + 1;
  }

  return {
    version: FOUNDATION8_REAL_PDF_CANARY_VERSION,
    segments,
    totals: {
      segmentsWithSpecialistAudit: segments.length,
      modelCallsAttempted: segments.reduce((sum, segment) => sum + segment.specialistModelCallsAttempted, 0),
      atomicGoodsRows: segments.reduce((sum, segment) => sum + (segment.reconciliation?.atomicGoodsRowCount ?? 0), 0),
      completeAtomicGoodsRows: segments.reduce((sum, segment) => sum + (segment.reconciliation?.completeAtomicGoodsRowCount ?? 0), 0),
      actions
    }
  };
}
