import { apiGetJson, apiPostJson, apiPutJson } from "./apiClient";

export type SummaryDayMode = "every" | "weekdays" | "weekend" | "custom";
export type SummaryRepeat = "once" | "every-2h";

export interface SummarySendPlan {
  dayMode: SummaryDayMode;
  customDays: number[];
  firstMinutes: number;
  repeat: SummaryRepeat;
  lastMinutes: number | null;
  cutoffEnabled: boolean;
  cutoffLeadHours: number;
}

export interface SummaryPlanPreview {
  slots: string[];
  preview: string;
  lastHourIncluded: boolean;
}

export interface CompanySummaryPlan {
  plan: SummarySendPlan | null;
  preview: SummaryPlanPreview | null;
}

export interface CustomerSummaryPlan extends CompanySummaryPlan {
  mode: "general" | "custom";
  effective: SummarySendPlan | null;
}

export interface SummaryPlanInput {
  dayMode: SummaryDayMode;
  customDays: number[];
  firstMinutes: string;
  repeat: SummaryRepeat;
  lastMinutes: string | null;
  cutoffEnabled: boolean;
  cutoffLeadHours: number;
}

export function getCompanySummaryPlan(): Promise<CompanySummaryPlan> {
  return apiGetJson<CompanySummaryPlan>("/api/mail/send-plan");
}

export function saveCompanySummaryPlan(plan: SummaryPlanInput): Promise<CompanySummaryPlan> {
  return apiPutJson<CompanySummaryPlan>("/api/mail/send-plan", plan);
}

export function previewSummaryPlan(plan: SummaryPlanInput): Promise<{ preview: SummaryPlanPreview | null }> {
  return apiPostJson<{ preview: SummaryPlanPreview | null }>("/api/mail/send-plan/preview", plan);
}

export function getCustomerSummaryPlan(customerId: string): Promise<CustomerSummaryPlan> {
  return apiGetJson<CustomerSummaryPlan>(`/api/customers/${encodeURIComponent(customerId)}/summary-plan`);
}

export function saveCustomerSummaryPlan(
  customerId: string,
  body: { mode: "general" | "custom"; plan?: SummaryPlanInput }
): Promise<CustomerSummaryPlan> {
  return apiPutJson<CustomerSummaryPlan>(`/api/customers/${encodeURIComponent(customerId)}/summary-plan`, body);
}
