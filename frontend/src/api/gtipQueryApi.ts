import { apiGetJson, apiPostJson, apiPostMultipart, apiPutJson } from "./apiClient";

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

export interface StoredGtipQueryResponse {
  customerId: string;
  customerName: string;
  fileName: string;
  pdfType: string;
  itemCount: number;
  results: GtipParseInvoiceResponse["results"];
}

export interface SaveGtipQueryPayload {
  customerId?: string;
  customerName?: string;
  fileName?: string;
  pdfType?: string;
  results: Array<{
    materialNo: string;
    description: string;
    foundGtip: string;
    status: GtipParseInvoiceResponse["results"][number]["status"];
    approvalStatus: GtipParseInvoiceResponse["results"][number]["approvalStatus"];
  }>;
}

export interface SendGtipQueryToApprovalPayload {
  customerId: string;
  results: SaveGtipQueryPayload["results"];
}

export interface SendToApprovalResponse {
  sent: number;
  skipped: number;
  skippedDuplicates: number;
  skippedExisting: number;
}

export async function getStoredGtipQuery(): Promise<StoredGtipQueryResponse> {
  return apiGetJson<StoredGtipQueryResponse>("/api/gtip-query/results");
}

export async function saveStoredGtipQuery(
  payload: SaveGtipQueryPayload
): Promise<StoredGtipQueryResponse> {
  return apiPutJson<StoredGtipQueryResponse>("/api/gtip-query/results", payload);
}

export async function sendGtipQueryToApproval(
  payload: SendGtipQueryToApprovalPayload
): Promise<SendToApprovalResponse> {
  return apiPostJson<SendToApprovalResponse>("/api/gtip-query/send-to-approval", payload);
}
