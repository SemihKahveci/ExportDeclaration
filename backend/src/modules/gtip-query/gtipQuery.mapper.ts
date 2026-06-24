import type { PythonInvoiceItem, PythonInvoiceResult } from "../extraction/python/invoiceParser.runner.js";

export interface GtipQueryResultDto {
  id: string;
  materialNo: string;
  description: string;
  foundGtip: string;
  status: "Bulundu" | "Operasyon Girişi Gerekli";
  approvalStatus: "Onaylı" | "Onay Bekliyor" | "Giriş Bekliyor";
  lineNo?: number;
  needsReview?: boolean;
}

function mapItem(item: PythonInvoiceItem, index: number): GtipQueryResultDto {
  const lineNo = item.lineNo ?? index + 1;
  const materialNo = item.productCode?.trim() || `KALEM-${lineNo}`;
  const description =
    item.description?.trim() ||
    item.rawLine?.trim().slice(0, 120) ||
    "—";
  // Script çıktısıyla birebir: 12 haneli ham GTİP (noktalı format yok)
  const foundGtip = item.gtip?.trim() || "—";
  const hasGtip = foundGtip !== "—";

  return {
    id: `qr-${Date.now()}-${lineNo}-${index}`,
    materialNo,
    description,
    foundGtip,
    status: hasGtip ? "Bulundu" : "Operasyon Girişi Gerekli",
    approvalStatus: hasGtip
      ? item.needsReview
        ? "Onay Bekliyor"
        : "Onay Bekliyor"
      : "Giriş Bekliyor",
    lineNo,
    needsReview: item.needsReview
  };
}

export function mapPythonInvoiceToGtipQueryResults(
  result: PythonInvoiceResult
): GtipQueryResultDto[] {
  return result.items.map((item, index) => mapItem(item, index));
}
