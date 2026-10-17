import type { FieldCandidate, FieldCandidateEnvelope, FieldCandidateEvidence } from "../domain/fieldCandidate.types.js";
import { reconcileInvoiceUnderstanding, type InvoiceReconciliationResult } from "./invoiceReconciliation.js";
import {
  InvoiceUnderstandingDecision,
  type GroundedValue,
  type InvoiceUnderstanding,
  type InvoiceUnderstandingEvidenceRef,
  type InvoiceUnderstandingGoodsRow
} from "./invoiceUnderstanding.types.js";
import {
  planInvoiceUnderstandingSpecialists,
  type InvoiceUnderstandingEvidenceBundle
} from "./invoiceUnderstandingOrchestration.js";

export const FOUNDATION8_SHADOW_RUNTIME_VERSION = "8.9.0" as const;

type CandidateValue = string | number;

export interface Foundation8ShadowRuntimeAudit {
  version: typeof FOUNDATION8_SHADOW_RUNTIME_VERSION;
  mode: "SHADOW_ONLY";
  productionCandidateMutation: false;
  specialistPlan: Array<{ domain: string; skillName: string; skillVersion: string; owns: readonly string[] }>;
  understanding: InvoiceUnderstanding;
  reconciliation: InvoiceReconciliationResult;
}

function evidenceRef(evidence: FieldCandidateEvidence): InvoiceUnderstandingEvidenceRef | undefined {
  if (!Number.isInteger(evidence.pageNumber) || evidence.pageNumber < 1 || evidence.contentSource === "DERIVED") return undefined;
  return {
    pageNumber: evidence.pageNumber,
    source: evidence.contentSource,
    quote: evidence.text,
    region: evidence.bbox ? {
      x: evidence.bbox.x0,
      y: evidence.bbox.y0,
      width: Math.max(0, evidence.bbox.x1 - evidence.bbox.x0),
      height: Math.max(0, evidence.bbox.y1 - evidence.bbox.y0)
    } : undefined
  };
}

function groundedCandidate<T extends CandidateValue>(candidate: FieldCandidate | undefined, guard: (value: unknown) => value is T): GroundedValue<T> | undefined {
  if (!candidate || candidate.derived || !guard(candidate.value)) return undefined;
  const evidence = candidate.evidence.map(evidenceRef).filter((item): item is InvoiceUnderstandingEvidenceRef => Boolean(item));
  if (!evidence.length) return undefined;
  return { value: candidate.value, confidence: candidate.confidence, evidence };
}

const isString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function bestCandidate(envelope: FieldCandidateEnvelope, field: string): FieldCandidate | undefined {
  return [...(envelope.fields[field] ?? [])]
    .filter(candidate => !candidate.derived && candidate.evidence.some(item => item.contentSource !== "DERIVED"))
    .sort((a, b) => b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))[0];
}

function stringValue(envelope: FieldCandidateEnvelope, field: string): GroundedValue<string> | undefined {
  return groundedCandidate(bestCandidate(envelope, field), isString);
}
function numberValue(envelope: FieldCandidateEnvelope, field: string): GroundedValue<number> | undefined {
  return groundedCandidate(bestCandidate(envelope, field), isNumber);
}

function uniqueEvidence(values: Array<GroundedValue<unknown> | undefined>): InvoiceUnderstandingEvidenceRef[] {
  const refs = values.flatMap(value => value?.evidence ?? []);
  const seen = new Set<string>();
  return refs.filter(ref => {
    const key = `${ref.pageNumber}|${ref.source}|${ref.quote ?? ""}|${JSON.stringify(ref.region ?? null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function goodsRows(envelope: FieldCandidateEnvelope): InvoiceUnderstandingGoodsRow[] {
  const indexes = new Set<number>();
  for (const field of Object.keys(envelope.fields)) {
    const match = /^goodsLines\.(\d+)\./.exec(field);
    if (match) indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b).flatMap(index => {
    const prefix = `goodsLines.${index}.`;
    const productCode = stringValue(envelope, `${prefix}productCode`);
    const description = stringValue(envelope, `${prefix}description`);
    const hsCode = stringValue(envelope, `${prefix}hsCode`);
    const quantity = numberValue(envelope, `${prefix}quantity`);
    const unit = stringValue(envelope, `${prefix}unit`);
    const unitPrice = numberValue(envelope, `${prefix}unitPrice`);
    const lineTotal = numberValue(envelope, `${prefix}lineTotal`);
    const origin = stringValue(envelope, `${prefix}origin`);
    const rowEvidence = uniqueEvidence([productCode, description, hsCode, quantity, unit, unitPrice, lineTotal, origin]);
    // A field index alone is not row identity. If no source evidence survives, do not materialize a row.
    if (!rowEvidence.length) return [];
    return [{
      rowId: `source-row-${index}`,
      rowEvidence,
      pageNumbers: [...new Set(rowEvidence.map(ref => ref.pageNumber))].sort((a, b) => a - b),
      productCode, description, hsCode, quantity, unit, unitPrice, lineTotal, origin
    }];
  });
}

export function projectCandidateEnvelopeToShadowUnderstanding(params: {
  documentId: string;
  candidates: FieldCandidateEnvelope;
}): InvoiceUnderstanding {
  const rows = goodsRows(params.candidates);
  const tableEvidence = uniqueEvidence(rows.flatMap(row => [
    row.productCode, row.description, row.hsCode, row.quantity, row.unit, row.unitPrice, row.lineTotal, row.origin
  ]));
  return {
    version: "1",
    documentId: params.documentId,
    decision: InvoiceUnderstandingDecision.PARTIAL,
    documentIdentity: {
      invoiceNo: stringValue(params.candidates, "invoiceNo"),
      invoiceDate: stringValue(params.candidates, "invoiceDate")
    },
    parties: {
      seller: {
        name: stringValue(params.candidates, "parties.seller.name"),
        address: stringValue(params.candidates, "parties.seller.address"),
        country: stringValue(params.candidates, "parties.seller.country")
      },
      buyer: {
        name: stringValue(params.candidates, "parties.buyer.name"),
        address: stringValue(params.candidates, "parties.buyer.address"),
        country: stringValue(params.candidates, "parties.buyer.country")
      }
    },
    commercialTerms: {
      currency: stringValue(params.candidates, "currency"),
      totalAmount: numberValue(params.candidates, "totalAmount"),
      exchangeRate: numberValue(params.candidates, "exchangeRate"),
      paymentTerm: stringValue(params.candidates, "paymentTerm"),
      bankDetails: stringValue(params.candidates, "bankDetails")
    },
    logistics: {
      deliveryTerm: stringValue(params.candidates, "deliveryTerm"),
      transportMode: stringValue(params.candidates, "transportMode"),
      grossWeight: numberValue(params.candidates, "grossWeight"),
      netWeight: numberValue(params.candidates, "netWeight")
    },
    packageSummary: {
      count: numberValue(params.candidates, "totalPackage"),
      type: stringValue(params.candidates, "packageType")
    },
    goodsTable: { tableEvidence, rows },
    issues: []
  };
}

export function runFoundation8ShadowRuntime(params: {
  documentId: string;
  candidates: FieldCandidateEnvelope;
  evidenceBundle: InvoiceUnderstandingEvidenceBundle;
}): Foundation8ShadowRuntimeAudit {
  const specialistPlan = planInvoiceUnderstandingSpecialists(params.evidenceBundle).map(request => ({
    domain: request.domain,
    skillName: request.skillName,
    skillVersion: request.skillVersion,
    owns: request.owns
  }));
  const understanding = projectCandidateEnvelopeToShadowUnderstanding({ documentId: params.documentId, candidates: params.candidates });
  const reconciliation = reconcileInvoiceUnderstanding(understanding);
  return {
    version: FOUNDATION8_SHADOW_RUNTIME_VERSION,
    mode: "SHADOW_ONLY",
    productionCandidateMutation: false,
    specialistPlan,
    understanding,
    reconciliation
  };
}
