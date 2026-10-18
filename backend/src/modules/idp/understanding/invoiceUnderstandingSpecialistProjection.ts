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

export const FOUNDATION8_SPECIALIST_PROJECTION_VERSION = "8.21.0" as const;

function evidenceRef(ref: InvoiceLlmEvidenceRef): InvoiceUnderstandingEvidenceRef {
  return { pageNumber: ref.pageNumber, source: ref.source, quote: ref.quote, region: ref.region };
}

function scalarValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, "value") ? record.value : value;
}

function localeNumber(value: unknown): number | undefined {
  const raw = scalarValue(value);
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  let token = raw.trim().replace(/\s+/g, "");
  const match = token.match(/[+-]?[0-9][0-9.,]*/);
  if (!match) return undefined;
  token = match[0];
  const comma = token.lastIndexOf(",");
  const dot = token.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    token = token.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    const decimals = token.length - comma - 1;
    token = decimals === 3 && /^\d{1,3}(,\d{3})+$/.test(token) ? token.replace(/,/g, "") : token.replace(",", ".");
  } else if (dot >= 0 && token.length - dot - 1 === 3 && /^\d{1,3}(\.\d{3})+$/.test(token)) {
    token = token.replace(/\./g, "");
  }
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  const raw = scalarValue(value);
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function groundedString(field: InvoiceLlmExtractedField | undefined): GroundedValue<string> | undefined {
  if (!field || !field.evidence.length) return undefined;
  const value = stringValue(field.value);
  return value === undefined ? undefined : { value, confidence: field.confidence, evidence: field.evidence.map(evidenceRef) };
}

function groundedNumber(field: InvoiceLlmExtractedField | undefined): GroundedValue<number> | undefined {
  if (!field || !field.evidence.length) return undefined;
  const value = localeNumber(field.value);
  return value === undefined ? undefined : { value, confidence: field.confidence, evidence: field.evidence.map(evidenceRef) };
}

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
    const productCode = groundedString(goods.get(`${prefix}productCode`));
    const description = groundedString(goods.get(`${prefix}description`));
    const hsCode = groundedString(goods.get(`${prefix}hsCode`));
    const quantity = groundedNumber(goods.get(`${prefix}quantity`));
    const unit = groundedString(goods.get(`${prefix}unit`));
    const unitPrice = groundedNumber(goods.get(`${prefix}unitPrice`));
    const lineTotal = groundedNumber(goods.get(`${prefix}lineTotal`));
    const origin = groundedString(goods.get(`${prefix}origin`));
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
  const expectedRowCountField = groundedNumber(goods.get("goodsTable.expectedRowCount"));
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
      invoiceNo: groundedString(commercial.get("invoiceNo")),
      invoiceDate: groundedString(commercial.get("invoiceDate"))
    },
    parties: {
      seller: {
        name: groundedString(parties.get("parties.seller.name")),
        address: groundedString(parties.get("parties.seller.address")),
        country: groundedString(parties.get("parties.seller.country"))
      },
      buyer: {
        name: groundedString(parties.get("parties.buyer.name")),
        address: groundedString(parties.get("parties.buyer.address")),
        country: groundedString(parties.get("parties.buyer.country"))
      }
    },
    commercialTerms: {
      currency: groundedString(commercial.get("currency")),
      totalAmount: groundedNumber(commercial.get("totalAmount")),
      exchangeRate: groundedNumber(commercial.get("exchangeRate")),
      paymentTerm: groundedString(commercial.get("paymentTerm")),
      bankDetails: groundedString(commercial.get("bankDetails"))
    },
    logistics: {
      deliveryTerm: groundedString(logistics.get("deliveryTerm")),
      transportMode: groundedString(logistics.get("transportMode")),
      grossWeight: groundedNumber(logistics.get("grossWeight")),
      netWeight: groundedNumber(logistics.get("netWeight"))
    },
    packageSummary: {
      count: groundedNumber(logistics.get("totalPackage")),
      type: groundedString(logistics.get("packageType"))
    },
    goodsTable: { tableEvidence, ...(expectedRowCount !== undefined ? { expectedRowCount } : {}), rows },
    issues
  };
}
