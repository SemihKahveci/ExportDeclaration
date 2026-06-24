import { apiPostMultipart } from "./apiClient";

export interface GtipParseInvoiceResponse {
  fileName: string;
  pdfType: string;
  itemCount: number;
  results: Array<{
    id: string;
    materialNo: string;
    description: string;
    foundGtip: string;
    status: "Bulundu" | "Operasyon Girişi Gerekli";
    approvalStatus: "Onaylı" | "Onay Bekliyor" | "Giriş Bekliyor";
    lineNo?: number;
    needsReview?: boolean;
  }>;
}

export async function parseInvoiceForGtipQuery(file: File): Promise<GtipParseInvoiceResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiPostMultipart<GtipParseInvoiceResponse>("/api/gtip-query/parse-invoice", form);
}
