import mongoose from "mongoose";
import { env } from "../../config/env.js";
import {
  CustomerMailModel,
  CustomerModel,
  CustomerNotificationRuleModel
} from "../customers/customer.models.js";
import { gtipFaultCount, gtipFaultSummary, type GtipGoodsLine, type GtipMaterialRow } from "../declarations/customerGtip.service.js";
import { missingDocumentsByDeclaration } from "../declarations/declaration.service.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { companyPlanOf } from "./mailSendPlan.service.js";
import { loadOpenMailFiles, withCustomer, withCutoff, type OpenMailFile } from "./openMailFiles.js";
import { LABEL_GTIP, LABEL_MISSING_DOCS, deliverProcessMail } from "./processMail.service.js";
import { assignedMtInfoEmails } from "./customerMtRecipients.js";
import {
  cutoffNotice,
  istanbulStamp,
  summaryHoldActive,
  summaryMailRow,
  summaryTableHtml,
  summaryTableText,
  type SummaryMailRow
} from "./summaryMailFormat.js";
import { summaryDueSlot, type SummarySendPlan } from "./summarySendPlan.js";

const SUMMARY_STEP = "ozet-hatirlatma" as const;
const CUTOFF_STEP = "cutoff-uyarisi" as const;

type OpenFile = OpenMailFile & {
  normalizedData?: { goodsLines?: GtipGoodsLine[] };
};

function automatic(rule: { status?: string; workingMode?: string } | undefined): boolean {
  if (!rule) return true;
  if (rule.status === "Pasif") return false;
  return rule.workingMode !== "Kapalı" && rule.workingMode !== "Manuel" && rule.workingMode !== "Kontrollü";
}

function audience(mails: Array<{ email: string; notificationProcesses: string[]; status: string; matchStatus: string }>, label: string): Set<string> {
  const active = mails.filter((mail) => mail.status !== "passive" && mail.matchStatus !== "passive" && mail.email.trim());
  const tagged = active.filter((mail) => mail.notificationProcesses.includes(label));
  return new Set(tagged.map((mail) => mail.email.trim().toLowerCase()));
}

async function claim(companyId: mongoose.Types.ObjectId, declarationId: mongoose.Types.ObjectId, ruleId: string, slotKey: string, now: Date): Promise<boolean> {
  const claimed = await DocumentReminderDispatchModel.updateOne(
    { declarationId, ruleId, slotKey },
    { $setOnInsert: { companyId, declarationId, ruleId, slotKey, sentAt: now } },
    { upsert: true }
  );
  return claimed.upsertedCount === 1;
}

async function release(declarationId: mongoose.Types.ObjectId, ruleId: string, slotKey: string): Promise<void> {
  await DocumentReminderDispatchModel.deleteOne({ declarationId, ruleId, slotKey });
}

export async function runCustomerSummaries(now = new Date(), openFiles?: OpenMailFile[]): Promise<number> {
  if (!env.mailEnabled) return 0;
  const files = withCustomer(openFiles ?? await loadOpenMailFiles()) as OpenFile[];
  if (files.length === 0) return 0;
  return sendGrouped(files, now, "summary");
}

export async function runCutoffAlerts(now = new Date(), openFiles?: OpenMailFile[]): Promise<number> {
  if (!env.mailEnabled) return 0;
  const files = withCutoff(openFiles ?? await loadOpenMailFiles()) as OpenFile[];
  if (files.length === 0) return 0;
  return sendGrouped(files, now, "cutoff");
}

async function sendGrouped(files: OpenFile[], now: Date, kind: "summary" | "cutoff"): Promise<number> {
  const byCompany = new Map<string, OpenFile[]>();
  for (const file of files) {
    const key = String(file.companyId);
    const group = byCompany.get(key) ?? [];
    group.push(file);
    byCompany.set(key, group);
  }
  let sent = 0;
  for (const [companyKey, group] of byCompany) {
    const companyId = new mongoose.Types.ObjectId(companyKey);
    const customerIds = [...new Set(group.map((file) => file.operation?.customerId).filter((id): id is string => Boolean(id)))];
    const [general, customers, rules, mails, missing, records, firstMails] = await Promise.all([
      companyPlanOf(companyId),
      CustomerModel.find({ _id: { $in: customerIds.filter((id) => mongoose.isValidObjectId(id)) }, companyId })
        .select({ summaryPlanMode: 1, summaryPlan: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; summaryPlanMode?: string; summaryPlan?: SummarySendPlan | null }>>(),
      CustomerNotificationRuleModel.find({ companyId, customerId: { $in: customerIds }, process: { $in: [LABEL_MISSING_DOCS, LABEL_GTIP] } })
        .select({ customerId: 1, process: 1, workingMode: 1, status: 1 }).lean<Array<{ customerId: string; process: string; workingMode?: string; status?: string }>>(),
      CustomerMailModel.find({ companyId, customerId: { $in: customerIds } })
        .select({ customerId: 1, email: 1, notificationProcesses: 1, status: 1, matchStatus: 1 })
        .lean<Array<{ customerId: string; email: string; notificationProcesses?: string[]; status: string; matchStatus: string }>>(),
      missingDocumentsByDeclaration(companyId, group.map((file) => ({
        _id: file._id,
        operation: file.operation ? {
          customerId: file.operation.customerId,
          operationType: (file.operation as { operationType?: string }).operationType,
          transportMode: (file.operation as { transportMode?: string | null }).transportMode
        } : null
      }))),
      MaterialRecordModel.find({ companyId, customerId: { $in: customerIds } })
        .select({ customerId: 1, materialNo: 1, gtipNo: 1, status: 1, pendingUpdate: 1 }).lean<Array<GtipMaterialRow & { customerId: string }>>(),
      DocumentReminderDispatchModel.find({
        declarationId: { $in: group.map((file) => file._id) },
        ruleId: { $in: ["eksik-evrak", "gtip-kontrol"] },
        slotKey: "first"
      }).select({ declarationId: 1, ruleId: 1, sentAt: 1 }).lean<Array<{ declarationId: mongoose.Types.ObjectId; ruleId: string; sentAt: Date }>>()
    ]);
    const planByCustomer = new Map(customers.map((customer) => [String(customer._id), customer]));
    const firstAt = new Map<string, Date>();
    for (const row of firstMails) firstAt.set(`${row.declarationId}:${row.ruleId}`, row.sentAt);

    for (const customerId of customerIds) {
      const stored = planByCustomer.get(customerId);
      const plan = stored?.summaryPlanMode === "custom" && stored.summaryPlan ? stored.summaryPlan : general;
      if (!plan) continue;
      const customerFiles = group.filter((file) => file.operation?.customerId === customerId);
      if (kind === "summary") sent += await sendSummary(companyId, customerId, plan, customerFiles, rules, mails, missing, records, firstAt, now);
      else sent += await sendCutoffs(companyId, customerId, plan, customerFiles, rules, mails, missing, records, now);
    }
  }
  return sent;
}

function visibleRow(
  file: OpenFile,
  seesDocs: boolean,
  seesGtip: boolean,
  missing: string[],
  gtipCount: number,
  gtipSummary: string
): SummaryMailRow | null {
  return summaryMailRow({
    ref: file.operation?.ref ?? "",
    declarationNo: file.operation?.declarationNo,
    createdAt: file.createdAt ?? new Date(0),
    missing: seesDocs ? missing : [],
    gtipCount: seesGtip ? gtipCount : 0,
    gtipSummary: seesGtip ? gtipSummary : ""
  });
}

async function sendSummary(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  plan: SummarySendPlan,
  files: OpenFile[],
  rules: Array<{ customerId: string; process: string; workingMode?: string; status?: string }>,
  mails: Array<{ customerId: string; email: string; notificationProcesses?: string[]; status: string; matchStatus: string }>,
  missingByFile: Map<string, string[]>,
  records: Array<GtipMaterialRow & { customerId: string }>,
  firstAt: Map<string, Date>,
  now: Date
): Promise<number> {
  const slot = summaryDueSlot(plan, now, new Set());
  if (!slot) return 0;
  const ownMails = mails.filter((mail) => mail.customerId === customerId).map((mail) => ({
    ...mail,
    notificationProcesses: mail.notificationProcesses ?? []
  }));
  const docRule = rules.find((rule) => rule.customerId === customerId && rule.process === LABEL_MISSING_DOCS);
  const gtipRule = rules.find((rule) => rule.customerId === customerId && rule.process === LABEL_GTIP);
  const docAudience = automatic(docRule) ? audience(ownMails, LABEL_MISSING_DOCS) : new Set<string>();
  const gtipAudience = automatic(gtipRule) ? audience(ownMails, LABEL_GTIP) : new Set<string>();
  const ownRecords = records.filter((row) => row.customerId === customerId);
  const buckets = new Map<string, SummaryMailRow[]>();
  for (const file of files) {
    const missing = missingByFile.get(String(file._id)) ?? [];
    const lines = file.normalizedData?.goodsLines ?? [];
    const gtipCount = gtipFaultCount(lines, ownRecords);
    const gtipSummary = gtipFaultSummary(lines, ownRecords);
    const held =
      summaryHoldActive(firstAt.get(`${file._id}:eksik-evrak`), now) ||
      summaryHoldActive(firstAt.get(`${file._id}:gtip-kontrol`), now);
    if (held) continue;
    for (const email of new Set([...docAudience, ...gtipAudience])) {
      const row = visibleRow(file, docAudience.has(email), gtipAudience.has(email), missing, gtipCount, gtipSummary);
      if (!row) continue;
      const bucket = buckets.get(email) ?? [];
      bucket.push(row);
      buckets.set(email, bucket);
    }
  }
  const mtCc = await assignedMtInfoEmails(companyId, customerId);
  let sent = 0;
  for (const [email, rows] of buckets) {
    if (rows.length === 0) continue;
    const ruleId = `summary:${customerId}:${email}`;
    if (!await claim(companyId, companyId, ruleId, slot, now)) continue;
    try {
      const count = await deliverProcessMail({
        companyId,
        processStep: SUMMARY_STEP,
        recipients: [email],
        cc: mtCc,
        values: {
          "{musteri}": files[0]?.operation?.customerName?.trim() || "Müşteri",
          "{referans}": rows.map((row) => row.ref).join(", "),
          "{tarih}": istanbulStamp(now, true),
          "{ozet_tablo}": summaryTableText(rows),
          "{beyanname_no}": "",
          "{eksik_evraklar}": "",
          "{gtip_sonuc}": "",
          "{tescil_no}": "",
          "{kapanis_durumu}": "",
          "{sorumlu}": "",
          "{cutoff}": ""
        },
        rawHtml: { "{ozet_tablo}": summaryTableHtml(rows) },
        allowFallback: true,
        fallbackSubject: "Özet hatırlatma · {tarih}",
        fallbackBody: "Sayın {musteri},\n\nSizden beklenen dosyalar:\n\n{ozet_tablo}\n\nİyi çalışmalar."
      });
      if (count === 0) {
        await release(companyId, ruleId, slot);
        continue;
      }
      sent += 1;
    } catch (error) {
      await release(companyId, ruleId, slot);
      console.error(JSON.stringify({
        event: "summary-mail.failed",
        customerId,
        message: error instanceof Error ? error.message : "Özet mail gönderilemedi"
      }));
    }
  }
  return sent;
}

async function sendCutoffs(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  plan: SummarySendPlan,
  files: OpenFile[],
  rules: Array<{ customerId: string; process: string; workingMode?: string; status?: string }>,
  mails: Array<{ customerId: string; email: string; notificationProcesses?: string[]; status: string; matchStatus: string }>,
  missingByFile: Map<string, string[]>,
  records: Array<GtipMaterialRow & { customerId: string }>,
  now: Date
): Promise<number> {
  if (!plan.cutoffEnabled) return 0;
  const leadMs = plan.cutoffLeadHours * 60 * 60 * 1000;
  const ownMails = mails.filter((mail) => mail.customerId === customerId).map((mail) => ({
    ...mail,
    notificationProcesses: mail.notificationProcesses ?? []
  }));
  const docRule = rules.find((rule) => rule.customerId === customerId && rule.process === LABEL_MISSING_DOCS);
  const gtipRule = rules.find((rule) => rule.customerId === customerId && rule.process === LABEL_GTIP);
  const docAudience = automatic(docRule) ? audience(ownMails, LABEL_MISSING_DOCS) : new Set<string>();
  const gtipAudience = automatic(gtipRule) ? audience(ownMails, LABEL_GTIP) : new Set<string>();
  const ownRecords = records.filter((row) => row.customerId === customerId);
  const priorCutoff = await DocumentReminderDispatchModel.find({
    declarationId: { $in: files.map((file) => file._id) },
    ruleId: { $regex: "^cutoff" }
  }).select({ declarationId: 1 }).lean<Array<{ declarationId: mongoose.Types.ObjectId }>>();
  const warned = new Set(priorCutoff.map((row) => String(row.declarationId)));
  const mtCc = await assignedMtInfoEmails(companyId, customerId);
  let sent = 0;
  for (const file of files) {
    if (warned.has(String(file._id))) continue;
    const cutoffAt = file.operation?.cutoffAt ? new Date(file.operation.cutoffAt) : null;
    if (!cutoffAt || Number.isNaN(cutoffAt.getTime()) || cutoffAt.getTime() <= now.getTime()) continue;
    if (cutoffAt.getTime() - now.getTime() > leadMs) continue;
    const missing = missingByFile.get(String(file._id)) ?? [];
    const lines = file.normalizedData?.goodsLines ?? [];
    const gtipCount = gtipFaultCount(lines, ownRecords);
    const gtipSummary = gtipFaultSummary(lines, ownRecords);
    const pendingDocs = missing.length > 0;
    const pendingGtip = gtipCount > 0;
    const recipients = [
      ...(pendingDocs ? docAudience : []),
      ...(pendingGtip ? gtipAudience : [])
    ];
    const row = visibleRow(file, pendingDocs, pendingGtip, missing, gtipCount, gtipSummary);
    if (!row || recipients.length === 0) continue;
    const ruleId = "cutoff";
    if (!await claim(companyId, file._id, ruleId, "once", now)) continue;
    try {
      const count = await deliverProcessMail({
        companyId,
        processStep: CUTOFF_STEP,
        recipients,
        cc: mtCc,
        values: {
          "{musteri}": file.operation?.customerName?.trim() || "Müşteri",
          "{referans}": row.ref,
          "{beyanname_no}": row.declarationNo === "—" ? "" : row.declarationNo,
          "{tarih}": istanbulStamp(now, true),
          "{cutoff}": cutoffNotice(cutoffAt, now),
          "{ozet_tablo}": summaryTableText([row]),
          "{eksik_evraklar}": "",
          "{gtip_sonuc}": "",
          "{tescil_no}": "",
          "{kapanis_durumu}": "",
          "{sorumlu}": ""
        },
        rawHtml: { "{ozet_tablo}": summaryTableHtml([row]) },
        allowFallback: true,
        fallbackSubject: "Cut-off uyarısı · {referans}",
        fallbackBody: "Sayın {musteri},\n\n{referans} dosyasında cut-off yaklaşıyor.\n\n{cutoff}\n\n{ozet_tablo}\n\nİyi çalışmalar."
      });
      if (count === 0) {
        await release(file._id, ruleId, "once");
        continue;
      }
      sent += 1;
    } catch (error) {
      await release(file._id, ruleId, "once");
      console.error(JSON.stringify({
        event: "cutoff-mail.failed",
        ref: file.operation?.ref,
        message: error instanceof Error ? error.message : "Cut-off maili gönderilemedi"
      }));
    }
  }
  return sent;
}
