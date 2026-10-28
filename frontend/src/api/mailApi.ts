import { apiPostJson } from "./apiClient";

export async function sendDocumentReminder(payload: {
  customerId: string;
  customerName: string;
  reference: string;
  missingDocuments: string[];
}): Promise<{ to: string[] }> {
  return apiPostJson<{ to: string[] }>("/api/mail/document-reminder", payload);
}
