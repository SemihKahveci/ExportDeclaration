import type { ExtractedSource } from "../../normalization/normalizedDeclaration.types.js";
import type { PythonInvoiceItem, PythonInvoiceResult } from "./invoiceParser.runner.js";

function parseTrNumber(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!s) return undefined;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let nStr = s;

  if (lastComma > lastDot) {
    nStr = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    nStr = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    nStr = s.replace(",", ".");
  }

  const n = Number(nStr);
  return Number.isFinite(n) ? n : undefined;
}

function pickHeaderFields(items: PythonInvoiceItem[]) {
  const first = items[0];
  if (!first) return {};

  return {
    currency: first.currency,
    deliveryTerm: first.deliveryTerm,
    transportMode: first.transportMode
  };
}

export function mapPythonInvoiceToExtracted(result: PythonInvoiceResult): ExtractedSource["data"] {
  const headerFields = pickHeaderFields(result.items);

  return {
    header: {
      currency: headerFields.currency
    },
    parties: {},
    trade: {
      deliveryTerm: headerFields.deliveryTerm
    },
    transport: {
      mode: headerFields.transportMode
    },
    packageInfo: {},
    goodsLines: result.items.map((item, index) => ({
      lineNo: item.lineNo ?? index + 1,
      hsCode: item.gtip,
      description: item.description,
      quantity: parseTrNumber(item.quantity),
      unit: item.unit,
      unitPrice: parseTrNumber(item.unitPrice),
      lineTotal: parseTrNumber(item.amount),
      productCode: item.productCode ?? undefined,
      needsReview: item.needsReview,
      rawLine: item.rawLine,
      boxes: item.boxes,
      source: item.source
    })),
    extractMeta: {
      pythonParser: true,
      pdfType: result.pdfType,
      itemCount: result.itemCount,
      needsReviewCount: result.items.filter((i) => i.needsReview).length,
      rawItems: result.items
    }
  };
}
