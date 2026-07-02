import {
  apiDeleteJson,
  apiGetJson,
  apiPatchJson,
  apiPostJson
} from "./apiClient";
import type { MailTemplate } from "@/types";

export type CreateMailTemplatePayload = Omit<MailTemplate, "id">;
export type UpdateMailTemplatePayload = Partial<CreateMailTemplatePayload>;

export async function listMailTemplates(): Promise<MailTemplate[]> {
  return apiGetJson<MailTemplate[]>("/api/mail-templates");
}

export async function createMailTemplate(payload: CreateMailTemplatePayload): Promise<MailTemplate> {
  return apiPostJson<MailTemplate>("/api/mail-templates", payload);
}

export async function updateMailTemplate(
  id: string,
  payload: UpdateMailTemplatePayload
): Promise<MailTemplate> {
  return apiPatchJson<MailTemplate>(`/api/mail-templates/${encodeURIComponent(id)}`, payload);
}

export async function deleteMailTemplate(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/mail-templates/${encodeURIComponent(id)}`);
}
