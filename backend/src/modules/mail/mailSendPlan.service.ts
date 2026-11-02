import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { CustomerModel } from "../customers/customer.models.js";
import { MailSendPlanModel, type MailSendPlanDoc } from "./mailSendPlan.model.js";
import {
  readSummaryPlan,
  summarizePlan,
  type SummaryPlanPreview,
  type SummarySendPlan
} from "./summarySendPlan.js";

export interface StoredSummaryPlan {
  mode: "general" | "custom";
  plan: SummarySendPlan | null;
  preview: SummaryPlanPreview | null;
  effective: SummarySendPlan | null;
}

function viewOf(plan: SummarySendPlan | null): { plan: SummarySendPlan | null; preview: SummaryPlanPreview | null } {
  if (!plan) return { plan: null, preview: null };
  return { plan, preview: summarizePlan(plan) };
}

function planFromDoc(doc: {
  dayMode: SummarySendPlan["dayMode"];
  customDays?: number[];
  firstMinutes: number;
  repeat: SummarySendPlan["repeat"];
  lastMinutes?: number | null;
  cutoffEnabled?: boolean;
  cutoffLeadHours?: number;
} | null): SummarySendPlan | null {
  if (!doc) return null;
  return {
    dayMode: doc.dayMode,
    customDays: doc.customDays ?? [],
    firstMinutes: doc.firstMinutes,
    repeat: doc.repeat,
    lastMinutes: doc.lastMinutes ?? null,
    cutoffEnabled: doc.cutoffEnabled === true,
    cutoffLeadHours: doc.cutoffLeadHours ?? 4
  };
}

function requirePlan(body: unknown): SummarySendPlan {
  const parsed = readSummaryPlan(body);
  if (!parsed.plan) throw new HttpError(400, parsed.issues[0] ?? "Gönderim planı kaydedilemedi.");
  return parsed.plan;
}

export function previewSummaryPlan(body: unknown): { plan: SummarySendPlan | null; preview: SummaryPlanPreview | null; issues: string[] } {
  const parsed = readSummaryPlan(body);
  if (!parsed.plan) return { plan: null, preview: null, issues: parsed.issues };
  return { plan: parsed.plan, preview: summarizePlan(parsed.plan), issues: [] };
}

export async function getCompanySummaryPlan(companyId: mongoose.Types.ObjectId) {
  const doc = await MailSendPlanModel.findOne({ companyId }).lean<MailSendPlanDoc | null>();
  return viewOf(planFromDoc(doc));
}

export async function saveCompanySummaryPlan(companyId: mongoose.Types.ObjectId, body: unknown) {
  const plan = requirePlan(body);
  const doc = await MailSendPlanModel.findOneAndUpdate(
    { companyId },
    { $set: { ...plan, companyId } },
    { upsert: true, new: true }
  ).lean<MailSendPlanDoc>();
  return viewOf(planFromDoc(doc));
}

export async function companyPlanOf(companyId: mongoose.Types.ObjectId): Promise<SummarySendPlan | null> {
  const doc = await MailSendPlanModel.findOne({ companyId }).lean<MailSendPlanDoc | null>();
  return planFromDoc(doc);
}

export async function getCustomerSummaryPlan(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<StoredSummaryPlan> {
  if (!mongoose.isValidObjectId(customerId)) throw new HttpError(400, "Geçersiz müşteri id.");
  const customer = await CustomerModel.findOne({ _id: customerId, companyId })
    .select({ summaryPlanMode: 1, summaryPlan: 1 })
    .lean<{ summaryPlanMode?: "general" | "custom"; summaryPlan?: SummarySendPlan | null } | null>();
  if (!customer) throw new HttpError(404, "Müşteri bulunamadı.");
  const mode = customer.summaryPlanMode === "custom" ? "custom" : "general";
  const own = mode === "custom" ? planFromDoc(customer.summaryPlan ?? null) : null;
  const general = await companyPlanOf(companyId);
  const effective = mode === "custom" ? own : general;
  return { mode, ...viewOf(own), effective };
}

export async function saveCustomerSummaryPlan(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  body: unknown
): Promise<StoredSummaryPlan> {
  if (!mongoose.isValidObjectId(customerId)) throw new HttpError(400, "Geçersiz müşteri id.");
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const mode = source.mode === "custom" ? "custom" : "general";
  const plan = mode === "custom" ? requirePlan(source.plan ?? source) : null;
  const customer = await CustomerModel.findOneAndUpdate(
    { _id: customerId, companyId },
    { $set: { summaryPlanMode: mode, summaryPlan: plan } },
    { new: true }
  ).select({ summaryPlanMode: 1, summaryPlan: 1 });
  if (!customer) throw new HttpError(404, "Müşteri bulunamadı.");
  const general = await companyPlanOf(companyId);
  return {
    mode,
    ...viewOf(plan),
    effective: mode === "custom" ? plan : general
  };
}
