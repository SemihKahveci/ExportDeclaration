import type { FieldCandidate, FieldCandidateEnvelope } from "../../idp/domain/fieldCandidate.types.js";
import type { UblParsedInvoice } from "./ublIhracatInvoice.types.js";
import { applyManufacturerRules, enrichInvoiceFromNotes, type VknManufacturerLookup } from "./ublIhracatNoteRules.js";

const EXTRACTOR = "ubl-ihracat-xml-v1";
const SEGMENT_ID = "ubl-xml-1";

export type UblFieldCandidateOptions = {
  senderEvrimId?: number;
  lookupManufacturer?: VknManufacturerLookup;
};

function candidate(
  field: string,
  value: unknown,
  suffix: string,
  confidence = 0.99
): FieldCandidate | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return {
    candidateId: `ubl-xml:${suffix}:${field}`,
    field,
    value,
    confidence,
    extractor: EXTRACTOR,
    evidence: [{
      segmentId: SEGMENT_ID,
      pageNumber: 1,
      text: String(value),
      contentSource: "DERIVED",
    }],
  };
}

function push(fields: Record<string, FieldCandidate[]>, item: FieldCandidate | undefined): void {
  if (!item) return;
  (fields[item.field] ??= []).push(item);
}

/** Foundation 6 declarationCandidates için UBL alan adayları. */
export function buildUblIhracatFieldCandidates(
  parsed: UblParsedInvoice,
  options: UblFieldCandidateOptions = {}
): FieldCandidateEnvelope {
  const invoice = enrichInvoiceFromNotes(parsed);
  const lines = applyManufacturerRules(invoice, options);
  const fields: Record<string, FieldCandidate[]> = {};

  push(fields, candidate("invoiceNo", invoice.invoiceNo, "header"));
  push(fields, candidate("invoiceDate", invoice.invoiceDate, "header"));
  push(fields, candidate("currency", invoice.currency, "header"));
  push(fields, candidate("totalAmount", invoice.totalAmount, "header"));
  push(fields, candidate("deliveryTerm", invoice.deliveryTerm, "trade"));
  push(fields, candidate("paymentType", invoice.paymentType, "trade"));
  push(fields, candidate("transportMode", invoice.transportMode, "transport"));
  push(fields, candidate("bankInfo", invoice.bankInfo, "finance"));
  // Promotion map parties.seller.* / parties.buyer.* bekler (seller.name promote edilmez).
  push(fields, candidate("parties.seller.name", invoice.seller?.name, "party"));
  push(fields, candidate("parties.seller.taxNo", invoice.seller?.taxNo, "party"));
  push(fields, candidate("parties.seller.country", invoice.seller?.countryCode, "party"));
  push(fields, candidate("parties.seller.address", invoice.seller?.address, "party"));
  push(fields, candidate("parties.buyer.name", invoice.buyer?.name, "party"));
  push(fields, candidate("parties.buyer.country", invoice.buyer?.countryCode, "party"));
  push(fields, candidate("parties.buyer.address", invoice.buyer?.address, "party"));
  push(fields, candidate("packageType", invoice.packageType, "package"));
  push(fields, candidate("totalPackage", invoice.totalPackage, "package"));
  push(fields, candidate("grossWeight", invoice.grossKg, "package"));
  push(fields, candidate("netWeight", invoice.netKg, "package"));

  for (const [index, line] of lines.entries()) {
    const p = `line-${line.lineNo}`;
    push(fields, candidate(`goodsLines.${index}.hsCode`, line.hsCode, p));
    push(fields, candidate(`goodsLines.${index}.productCode`, line.productCode, p));
    push(fields, candidate(`goodsLines.${index}.description`, line.description, p));
    push(fields, candidate(`goodsLines.${index}.quantity`, line.quantity, p));
    push(fields, candidate(`goodsLines.${index}.unit`, line.unit, p));
    push(fields, candidate(`goodsLines.${index}.unitPrice`, line.unitPrice, p));
    push(fields, candidate(`goodsLines.${index}.lineTotal`, line.lineTotal, p));
    push(fields, candidate(`goodsLines.${index}.origin`, line.origin, p));
    push(fields, candidate(`goodsLines.${index}.netKg`, line.netKg, p));
    push(fields, candidate(`goodsLines.${index}.packageType`, line.packageType, p));
    push(fields, candidate(`goodsLines.${index}.manufacturerNo`, line.manufacturerNo, p));
    push(fields, candidate(`goodsLines.${index}.manufacturerType`, line.manufacturerType, p));
    push(fields, candidate(`goodsLines.${index}.invoiceNo`, invoice.invoiceNo, p));
  }

  return { version: "1", fields };
}

export function ublParsedToExtractedData(
  parsed: UblParsedInvoice,
  options: UblFieldCandidateOptions = {}
): Record<string, unknown> {
  const invoice = enrichInvoiceFromNotes(parsed);
  const lines = applyManufacturerRules(invoice, options);
  return {
    header: {
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      currency: invoice.currency,
      totalAmount: invoice.totalAmount,
    },
    parties: {
      seller: invoice.seller,
      buyer: invoice.buyer,
    },
    trade: {
      deliveryTerm: invoice.deliveryTerm,
      paymentType: invoice.paymentType,
    },
    transport: {
      mode: invoice.transportMode,
    },
    finance: {
      bankInfo: invoice.bankInfo,
    },
    packageInfo: {
      packageType: invoice.packageType,
      totalPackage: invoice.totalPackage,
      grossKg: invoice.grossKg,
      netKg: invoice.netKg,
    },
    goodsLines: lines.map((line) => ({
      lineNo: line.lineNo,
      hsCode: line.hsCode,
      productCode: line.productCode,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      origin: line.origin,
      netKg: line.netKg,
      packageType: line.packageType,
      manufacturerNo: line.manufacturerNo,
      manufacturerType: line.manufacturerType,
      invoiceNo: invoice.invoiceNo,
    })),
    ublProfileId: invoice.profileId,
    invoiceNotes: invoice.invoiceNotes,
  };
}
