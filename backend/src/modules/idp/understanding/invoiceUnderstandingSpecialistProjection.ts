import type { InvoiceLlmExtractedField, InvoiceLlmEvidenceRef } from "../domain/invoiceLlmExtraction.types.js";
import {
  InvoiceUnderstandingDecision,
  type GroundedValue,
  type InvoiceUnderstanding,
  type InvoiceUnderstandingEvidenceRef,
  type InvoiceUnderstandingGoodsRow,
  type InvoiceUnderstandingIssue
} from "./invoiceUnderstanding.types.js";
import type { Foundation8SpecialistModelExecutionAudit } from "./invoiceUnderstandingSpecialistModelExecution.js";

export const FOUNDATION8_SPECIALIST_PROJECTION_VERSION = "8.16.0" as const;

function evidenceRef(ref: InvoiceLlmEvidenceRef): InvoiceUnderstandingEvidenceRef {
  return { pageNumber: ref.pageNumber, source: ref.source, quote: ref.quote, region: ref.region };
}

function grounded<T>(field: InvoiceLlmExtractedField | undefined, guard: (value: unknown) => value is T): GroundedValue<T> | undefined {
  if (!field || !guard(field.value) || !field.evidence.length) return undefined;
  return { value: field.value, confidence: field.confidence, evidence: field.evidence.map(evidenceRef) };
}

const isString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function fieldMap(audit: Foundation8SpecialistModelExecutionAudit, domain: "PARTIES" | "COMMERCIAL" | "GOODS" | "LOGISTICS"): Map<string, InvoiceLlmExtractedField> {
  const specialist = audit.specialists.find(item => item.domain === domain && item.status === "COMPLETED");
  return new Map((specialist?.response?.fields ?? []).map(field => [field.field, field]));
}

function uniqueEvidence(fields: Array<GroundedValue<unknown> | undefined>): InvoiceUnderstandingEvidenceRef[] {
  const seen = new Set<string>();
  return fields.flatMap(field => field?.evidence ?? []).filter(ref => {
    const key = `${ref.pageNumber}|${ref.source}|${ref.quote ?? ""}|${JSON.stringify(ref.region ?? null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowEvidenceFingerprint(index: number, evidence: InvoiceUnderstandingEvidenceRef[]): string {
  const pages = [...new Set(evidence.map(ref => ref.pageNumber))].sort((a, b) => a - b).join("-") || "unknown";
  return `model-row-${index}-p${pages}`;
}

function projectGoodsRows(goods: Map<string, InvoiceLlmExtractedField>, issues: InvoiceUnderstandingIssue[]): InvoiceUnderstandingGoodsRow[] {
  const indexes = new Set<number>();
  for (const field of goods.keys()) {
    const match = /^goodsLines\.(\d+)\./.exec(field);
    if (match) indexes.add(Number(match[1]));
  }

  return [...indexes].sort((a, b) => a - b).flatMap(index => {
    const prefix = `goodsLines.${index}.`;
    const productCode = grounded(goods.get(`${prefix}productCode`), isString);
    const description = grounded(goods.get(`${prefix}description`), isString);
    const hsCode = grounded(goods.get(`${prefix}hsCode`), isString);
    const quantity = grounded(goods.get(`${prefix}quantity`), isNumber);
    const unit = grounded(goods.get(`${prefix}unit`), isString);
    const unitPrice = grounded(goods.get(`${prefix}unitPrice`), isNumber);
    const lineTotal = grounded(goods.get(`${prefix}lineTotal`), isNumber);
    const origin = grounded(goods.get(`${prefix}origin`), isString);
    const rowEvidence = uniqueEvidence([productCode, description, hsCode, quantity, unit, unitPrice, lineTotal, origin]);
    if (!rowEvidence.length) return [];

    const rowPages = new Set(rowEvidence.map(ref => ref.pageNumber));
    const groundedFields = [productCode, description, hsCode, quantity, unit, unitPrice, lineTotal, origin].filter(Boolean) as GroundedValue<unknown>[];
    if (groundedFields.some(field => !field.evidence.some(ref => rowPages.has(ref.pageNumber)))) {
      issues.push({ code: "GOODS_ROW_EVIDENCE_NOT_LOCAL", message: `Goods row ${index} contains evidence outside its row evidence boundary.`, scope: "GOODS_ROW" });
      return [];
    }

    return [{
      rowId: rowEvidenceFingerprint(index, rowEvidence),
      rowEvidence,
      pageNumbers: [...rowPages].sort((a, b) => a - b),
      productCode, description, hsCode, quantity, unit, unitPrice, lineTotal, origin
    }];
  });
}

/**
 * Projects bounded specialist model responses into one atomic shadow understanding.
 * This is projection only: no FieldCandidate, F6, normalizedData, or production mutation occurs.
 */
export function projectSpecialistModelAuditToInvoiceUnderstanding(params: {
  documentId: string;
  audit: Foundation8SpecialistModelExecutionAudit;
}): InvoiceUnderstanding {
  const parties = fieldMap(params.audit, "PARTIES");
  const commercial = fieldMap(params.audit, "COMMERCIAL");
  const goods = fieldMap(params.audit, "GOODS");
  const logistics = fieldMap(params.audit, "LOGISTICS");
  const issues: InvoiceUnderstandingIssue[] = params.audit.specialists
    .filter(item => item.status === "FAILED")
    .map(item => ({ code: "SPECIALIST_FAILED", message: `${item.domain}: ${item.error ?? "specialist failed"}`, scope: "DOCUMENT" }));

  const rows = projectGoodsRows(goods, issues);
  const expectedRowCountField = grounded(goods.get("goodsTable.expectedRowCount"), isNumber);
  const expectedRowCount = expectedRowCountField && Number.isInteger(expectedRowCountField.value) && expectedRowCountField.value >= 0
    ? expectedRowCountField.value
    : undefined;
  const tableEvidence = uniqueEvidence(rows.flatMap(row => [row.productCode, row.description, row.hsCode, row.quantity, row.unit, row.unitPrice, row.lineTotal, row.origin]));
  const anyFailed = params.audit.specialists.some(item => item.status === "FAILED");

  return {
    version: "1",
    documentId: params.documentId,
    decision: anyFailed ? InvoiceUnderstandingDecision.REVIEW_REQUIRED : InvoiceUnderstandingDecision.PARTIAL,
    documentIdentity: {
      invoiceNo: grounded(commercial.get("invoiceNo"), isString),
      invoiceDate: grounded(commercial.get("invoiceDate"), isString)
    },
    parties: {
      seller: {
        name: grounded(parties.get("parties.seller.name"), isString),
        address: grounded(parties.get("parties.seller.address"), isString),
        country: grounded(parties.get("parties.seller.country"), isString)
      },
      buyer: {
        name: grounded(parties.get("parties.buyer.name"), isString),
        address: grounded(parties.get("parties.buyer.address"), isString),
        country: grounded(parties.get("parties.buyer.country"), isString)
      }
    },
    commercialTerms: {
      currency: grounded(commercial.get("currency"), isString),
      totalAmount: grounded(commercial.get("totalAmount"), isNumber),
      exchangeRate: grounded(commercial.get("exchangeRate"), isNumber),
      paymentTerm: grounded(commercial.get("paymentTerm"), isString),
      bankDetails: grounded(commercial.get("bankDetails"), isString)
    },
    logistics: {
      deliveryTerm: grounded(logistics.get("deliveryTerm"), isString),
      transportMode: grounded(logistics.get("transportMode"), isString),
      grossWeight: grounded(logistics.get("grossWeight"), isNumber),
      netWeight: grounded(logistics.get("netWeight"), isNumber)
    },
    packageSummary: {
      count: grounded(logistics.get("totalPackage"), isNumber),
      type: grounded(logistics.get("packageType"), isString)
    },
    goodsTable: { tableEvidence, ...(expectedRowCount !== undefined ? { expectedRowCount } : {}), rows },
    issues
  };
}
