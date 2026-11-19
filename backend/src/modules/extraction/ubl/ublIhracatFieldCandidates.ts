import type { FieldCandidate, FieldCandidateEnvelope } from "../../idp/domain/fieldCandidate.types.js";
import type { UblParsedInvoice } from "./ublIhracatInvoice.types.js";
import { applyNoteOriginRules } from "./ublIhracatNoteRules.js";

const EXTRACTOR = "ubl-ihracat-xml-v1";
const SEGMENT_ID = "ubl-xml-1";

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
export function buildUblIhracatFieldCandidates(parsed: UblParsedInvoice): FieldCandidateEnvelope {
  const invoice = applyNoteOriginRules(parsed);
  const fields: Record<string, FieldCandidate[]> = {};

  push(fields, candidate("invoiceNo", invoice.invoiceNo, "header"));
  push(fields, candidate("invoiceDate", invoice.invoiceDate, "header"));
  push(fields, candidate("currency", invoice.currency, "header"));
  push(fields, candidate("totalAmount", invoice.totalAmount, "header"));
  push(fields, candidate("deliveryTerm", invoice.deliveryTerm, "trade"));
  push(fields, candidate("seller.name", invoice.seller?.name, "party"));
  push(fields, candidate("seller.taxNo", invoice.seller?.taxNo, "party"));
  push(fields, candidate("seller.country", invoice.seller?.countryCode, "party"));
  push(fields, candidate("seller.address", invoice.seller?.address, "party"));
  push(fields, candidate("buyer.name", invoice.buyer?.name, "party"));
  push(fields, candidate("buyer.country", invoice.buyer?.countryCode, "party"));
  push(fields, candidate("buyer.address", invoice.buyer?.address, "party"));
  push(fields, candidate("packageType", invoice.packageType, "package"));

  for (const [index, line] of invoice.goodsLines.entries()) {
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
    push(fields, candidate(`goodsLines.${index}.invoiceNo`, invoice.invoiceNo, p));
  }

  return { version: "1", fields };
}

export function ublParsedToExtractedData(parsed: UblParsedInvoice): Record<string, unknown> {
  const invoice = applyNoteOriginRules(parsed);
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
    },
    transport: {},
    packageInfo: {
      packageType: invoice.packageType,
    },
    goodsLines: invoice.goodsLines.map((line) => ({
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
      invoiceNo: invoice.invoiceNo,
    })),
    ublProfileId: invoice.profileId,
    invoiceNotes: invoice.invoiceNotes,
  };
}
