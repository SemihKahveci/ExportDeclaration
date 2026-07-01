import {
  apiDeleteJson,
  apiGetBlob,
  apiGetJson,
  apiPatchJson,
  apiPostJson,
  apiPostMultipart
} from "./apiClient";
import type { MaterialRecord } from "@/types";

export type CreateMaterialRecordPayload = Omit<MaterialRecord, "id" | "customerId" | "updatedAt">;
export type BulkMaterialRecordItem = CreateMaterialRecordPayload;

export interface MaterialRecordImportRowError {
  row: number;
  message: string;
}

export interface MaterialRecordImportResult {
  records: MaterialRecord[];
  count: number;
  errors: MaterialRecordImportRowError[];
}

export async function listMaterialRecords(customerId: string): Promise<MaterialRecord[]> {
  const q = new URLSearchParams({ customerId });
  return apiGetJson<MaterialRecord[]>(`/api/material-records?${q}`);
}

export async function getCustomerRecordCounts(): Promise<Array<{ customerId: string; recordCount: number }>> {
  return apiGetJson<Array<{ customerId: string; recordCount: number }>>(
    "/api/material-records/customer-counts"
  );
}

export async function createMaterialRecord(
  payload: CreateMaterialRecordPayload & { customerId: string }
): Promise<MaterialRecord> {
  return apiPostJson<MaterialRecord>("/api/material-records", payload);
}

export async function bulkCreateMaterialRecords(
  customerId: string,
  items: BulkMaterialRecordItem[]
): Promise<MaterialRecord[]> {
  return apiPostJson<MaterialRecord[]>("/api/material-records/bulk", { customerId, items });
}

export async function patchMaterialRecord(
  id: string,
  patch: Partial<Pick<MaterialRecord, "status" | "materialNo" | "description" | "gtipNo" | "transactionTypes">>
): Promise<MaterialRecord> {
  return apiPatchJson<MaterialRecord>(`/api/material-records/${encodeURIComponent(id)}`, patch);
}

export async function deleteMaterialRecord(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/material-records/${encodeURIComponent(id)}`);
}

export async function downloadMaterialRecordTemplate(): Promise<void> {
  const blob = await apiGetBlob("/api/material-records/import-template");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "GTIP_Yukle_Sablon.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importMaterialRecordsExcel(
  customerId: string,
  file: File
): Promise<MaterialRecordImportResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("customerId", customerId);
  return apiPostMultipart<MaterialRecordImportResult>("/api/material-records/import", form);
}
