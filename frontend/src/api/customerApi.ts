import {
  apiDeleteJson,
  apiGetJson,
  apiPatchJson,
  apiPostJson
} from "./apiClient";
import type {
  CustomerAddress,
  CustomerListItem,
  CustomerMail,
  DeclarationFieldRule,
  DocumentRule,
  MailDomain,
  NotificationRule
} from "@/types";

export async function listCustomers(): Promise<CustomerListItem[]> {
  return apiGetJson<CustomerListItem[]>("/api/customers");
}

export async function createCustomer(payload: {
  name: string;
  country?: string;
  initials?: string;
}): Promise<CustomerListItem> {
  return apiPostJson<CustomerListItem>("/api/customers", payload);
}

export async function updateCustomer(
  id: string,
  payload: Partial<{
    name: string;
    country: string;
    initials: string;
    assignedMtUserId: string | null;
    assignedMtManagerUserId: string | null;
  }>
): Promise<CustomerListItem> {
  return apiPatchJson<CustomerListItem>(`/api/customers/${encodeURIComponent(id)}`, payload);
}

export async function deleteCustomer(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/customers/${encodeURIComponent(id)}`);
}

export async function listAddresses(customerId: string): Promise<CustomerAddress[]> {
  return apiGetJson<CustomerAddress[]>(
    `/api/customers/${encodeURIComponent(customerId)}/addresses`
  );
}

export async function createAddress(
  customerId: string,
  payload: Omit<CustomerAddress, "id" | "customerId">
): Promise<CustomerAddress> {
  return apiPostJson<CustomerAddress>(
    `/api/customers/${encodeURIComponent(customerId)}/addresses`,
    payload
  );
}

export async function updateAddress(
  id: string,
  payload: Partial<Omit<CustomerAddress, "id" | "customerId">>
): Promise<CustomerAddress> {
  return apiPatchJson<CustomerAddress>(
    `/api/customers/addresses/${encodeURIComponent(id)}`,
    payload
  );
}

export async function deleteAddress(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(
    `/api/customers/addresses/${encodeURIComponent(id)}`
  );
}

export async function listDomains(customerId: string): Promise<MailDomain[]> {
  return apiGetJson<MailDomain[]>(`/api/customers/${encodeURIComponent(customerId)}/domains`);
}

export async function createDomain(
  customerId: string,
  payload: Omit<MailDomain, "id" | "customerId">
): Promise<MailDomain> {
  return apiPostJson<MailDomain>(
    `/api/customers/${encodeURIComponent(customerId)}/domains`,
    payload
  );
}

export async function updateDomain(
  id: string,
  payload: Partial<Omit<MailDomain, "id" | "customerId">>
): Promise<MailDomain> {
  return apiPatchJson<MailDomain>(`/api/customers/domains/${encodeURIComponent(id)}`, payload);
}

export async function deleteDomain(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(
    `/api/customers/domains/${encodeURIComponent(id)}`
  );
}

export async function listMails(customerId: string): Promise<CustomerMail[]> {
  return apiGetJson<CustomerMail[]>(`/api/customers/${encodeURIComponent(customerId)}/mails`);
}

export async function createMail(
  customerId: string,
  payload: Omit<CustomerMail, "id" | "customerId">
): Promise<CustomerMail> {
  return apiPostJson<CustomerMail>(
    `/api/customers/${encodeURIComponent(customerId)}/mails`,
    payload
  );
}

export async function updateMail(
  id: string,
  payload: Partial<Omit<CustomerMail, "id" | "customerId">>
): Promise<CustomerMail> {
  return apiPatchJson<CustomerMail>(`/api/customers/mails/${encodeURIComponent(id)}`, payload);
}

export async function deleteMail(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(`/api/customers/mails/${encodeURIComponent(id)}`);
}

export async function listDocumentRules(customerId: string): Promise<DocumentRule[]> {
  return apiGetJson<DocumentRule[]>(
    `/api/customers/${encodeURIComponent(customerId)}/document-rules`
  );
}

export async function createDocumentRule(
  customerId: string,
  payload: Omit<DocumentRule, "id" | "customerId">
): Promise<DocumentRule> {
  return apiPostJson<DocumentRule>(
    `/api/customers/${encodeURIComponent(customerId)}/document-rules`,
    payload
  );
}

export async function updateDocumentRule(
  id: string,
  payload: Partial<Omit<DocumentRule, "id" | "customerId">>
): Promise<DocumentRule> {
  return apiPatchJson<DocumentRule>(
    `/api/customers/document-rules/${encodeURIComponent(id)}`,
    payload
  );
}

export async function deleteDocumentRule(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(
    `/api/customers/document-rules/${encodeURIComponent(id)}`
  );
}

export async function listNotificationRules(customerId: string): Promise<NotificationRule[]> {
  return apiGetJson<NotificationRule[]>(
    `/api/customers/${encodeURIComponent(customerId)}/notification-rules`
  );
}

export async function createNotificationRule(
  customerId: string,
  payload: Omit<NotificationRule, "id" | "customerId">
): Promise<NotificationRule> {
  return apiPostJson<NotificationRule>(
    `/api/customers/${encodeURIComponent(customerId)}/notification-rules`,
    payload
  );
}

export async function updateNotificationRule(
  id: string,
  payload: Partial<Omit<NotificationRule, "id" | "customerId">>
): Promise<NotificationRule> {
  return apiPatchJson<NotificationRule>(
    `/api/customers/notification-rules/${encodeURIComponent(id)}`,
    payload
  );
}

export async function deleteNotificationRule(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(
    `/api/customers/notification-rules/${encodeURIComponent(id)}`
  );
}

export async function listDeclarationFieldRules(
  customerId: string
): Promise<DeclarationFieldRule[]> {
  return apiGetJson<DeclarationFieldRule[]>(
    `/api/customers/${encodeURIComponent(customerId)}/declaration-field-rules`
  );
}

export async function createDeclarationFieldRule(
  customerId: string,
  payload: Omit<DeclarationFieldRule, "id" | "customerId">
): Promise<DeclarationFieldRule> {
  return apiPostJson<DeclarationFieldRule>(
    `/api/customers/${encodeURIComponent(customerId)}/declaration-field-rules`,
    payload
  );
}

export async function updateDeclarationFieldRule(
  id: string,
  payload: Partial<Omit<DeclarationFieldRule, "id" | "customerId">>
): Promise<DeclarationFieldRule> {
  return apiPatchJson<DeclarationFieldRule>(
    `/api/customers/declaration-field-rules/${encodeURIComponent(id)}`,
    payload
  );
}

export async function deleteDeclarationFieldRule(id: string): Promise<void> {
  await apiDeleteJson<{ deleted: boolean }>(
    `/api/customers/declaration-field-rules/${encodeURIComponent(id)}`
  );
}
