import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { env } from "../../config/env.js";
import { CustomerNotificationRuleModel } from "../customers/customer.models.js";
import { listMails } from "../customers/customer.service.js";
import { MailTemplateModel, type MailTemplateDoc } from "../mail-templates/mailTemplate.model.js";
import { AppUserModel } from "../users/user.model.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { gtipFaultSummary, gtipMatchIsClean, type GtipGoodsLine, type GtipMaterialRow } from "../declarations/customerGtip.service.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { istanbulClock } from "./documentReminderSchedule.js";
import { sendMail } from "./mail.service.js";

export const PROCESS_FILE_CREATED = "dosya-olusturuldu";
export const LABEL_FILE_CREATED = "Dosya Oluşturuldu";
export const LABEL_MISSING_DOCS = "Eksik Evrak Hatırlatma";
export const LABEL_GTIP = "GTİP Eksik/Hatalı";
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

type RecipientKind = "defined" | "sender" | "both";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fillTemplate(text: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((current, [key, value]) => current.split(key).join(value), text);
}

export function recipientKind(rule: string | undefined): RecipientKind {
  const text = (rule ?? "").trim().toLocaleLowerCase("tr-TR");
  if (text === "her ikisi") return "both";
  if (text.includes("gönderen") || text.includes("gonderen") || text === "kullanıcı seçimi" || text === "kullanici secimi") {
    return "sender";
  }
  return "defined";
}

export async function senderEmail(userId?: mongoose.Types.ObjectId | string | null): Promise<string | null> {
  if (!userId || !mongoose.isValidObjectId(String(userId))) return null;
  const user = await AppUserModel.findById(userId).select({ email: 1, status: 1 }).lean<{ email?: string; status?: string } | null>();
  if (!user || user.status === "Pasif" || !user.email?.trim()) return null;
  return user.email.trim().toLowerCase();
}

export async function resolveProcessRecipients(input: {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  processLabel: string;
  senderEmail?: string | null;
  mode: "automatic" | "manual";
}): Promise<string[]> {
  const rule = await CustomerNotificationRuleModel.findOne({
    companyId: input.companyId,
    customerId: input.customerId,
    process: input.processLabel
  }).sort({ updatedAt: -1 }).lean<{ status?: string; workingMode?: string; recipientRule?: string } | null>();

  if (rule && (rule.status === "Pasif" || rule.workingMode === "Kapalı" || rule.workingMode === "Manuel")) return [];
  if (input.mode === "automatic" && rule?.workingMode === "Kontrollü") return [];

  const kind = recipientKind(rule?.recipientRule);
  const saved = await listMails(input.companyId, input.customerId);
  const active = saved.filter((mail) => mail.status !== "passive" && mail.matchStatus !== "passive" && mail.email.trim());
  const tagged = active.filter((mail) => mail.notificationProcesses.includes(input.processLabel));
  const defined = [...new Set((tagged.length > 0 ? tagged : active).map((mail) => mail.email.trim().toLowerCase()))];
  const sender = input.senderEmail?.trim().toLowerCase() ?? "";

  if (kind === "sender") return input.mode === "manual" && sender ? [sender] : [];
  if (kind === "both") {
    return [...new Set([...defined, ...(input.mode === "manual" && sender ? [sender] : [])])];
  }
  return defined;
}

export function renderMailVariables(input: {
  customerName?: string | null;
  reference?: string | null;
  declarationNo?: string | null;
  missingDocuments?: string[];
  gtipResult?: string | null;
  tescilNo?: string | null;
}): Record<string, string> {
  const reference = input.reference?.trim() ?? "";
  const missing = (input.missingDocuments ?? []).map((item) => item.trim()).filter(Boolean);
  return {
    "{musteri}": input.customerName?.trim() || "Müşteri",
    "{referans}": reference,
    "{beyanname_no}": input.declarationNo?.trim() || "",
    "{eksik_evraklar}": missing.join(", "),
    "{gtip_sonuc}": input.gtipResult?.trim() ?? "",
    "{tescil_no}": input.tescilNo?.trim() ?? "",
    "{tarih}": new Date().toLocaleDateString("tr-TR"),
    "{kapanis_durumu}": "",
    "{sorumlu}": ""
  };
}

export async function declarationMailVariables(
  companyId: mongoose.Types.ObjectId,
  declaration: {
    _id: mongoose.Types.ObjectId;
    normalizedData?: unknown;
    operation?: {
      customerId?: string;
      customerName?: string;
      ref?: string;
      declarationNo?: string | null;
      tescilNo?: string | null;
      operationType?: string | null;
      transportMode?: string | null;
    } | null;
  },
  missingOverride?: string[]
): Promise<Record<string, string>> {
  const operation = declaration.operation;
  const lines = (declaration.normalizedData as { goodsLines?: GtipGoodsLine[] } | undefined)?.goodsLines ?? [];
  const records = operation?.customerId
    ? await MaterialRecordModel.find({ companyId, customerId: operation.customerId }).select({ materialNo: 1, gtipNo: 1, status: 1, pendingUpdate: 1 }).lean<GtipMaterialRow[]>()
    : [];
  let missing = missingOverride;
  if (!missing) {
    const { missingDocumentsByDeclaration } = await import("../declarations/declaration.service.js");
    const found = await missingDocumentsByDeclaration(companyId, [{
      _id: declaration._id,
      operation: operation ? {
        customerId: operation.customerId,
        operationType: operation.operationType ?? undefined,
        transportMode: operation.transportMode ?? null
      } : null
    }]);
    missing = found.get(String(declaration._id)) ?? [];
  }
  return renderMailVariables({
    customerName: operation?.customerName,
    reference: operation?.ref,
    declarationNo: operation?.declarationNo,
    missingDocuments: missing,
    gtipResult: gtipFaultSummary(lines, records),
    tescilNo: operation?.tescilNo
  });
}

export async function deliverProcessMail(input: {
  companyId: mongoose.Types.ObjectId;
  processStep: MailTemplateDoc["processStep"];
  recipients: string[];
  values: Record<string, string>;
  fallbackSubject: string;
  fallbackBody: string;
  manual?: boolean;
}): Promise<number> {
  if (!env.mailEnabled) {
    if (input.manual) throw new HttpError(409, "Mail gönderimi kapalı.");
    return 0;
  }
  const recipients = [...new Set(input.recipients.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) {
    if (input.manual) throw new HttpError(400, "Bu süreç için alıcı bulunamadı.");
    return 0;
  }
  const template = await MailTemplateModel.findOne({
    companyId: input.companyId,
    processStep: input.processStep,
    active: true
  }).sort({ updatedAt: -1 });
  if (!template) {
    if (input.manual) throw new HttpError(404, "Bu süreç için aktif mail şablonu yok.");
    return 0;
  }
  const subject = fillTemplate(template.subject.trim() || input.fallbackSubject, input.values);
  const text = fillTemplate(template.body.trim() || input.fallbackBody, input.values);
  for (const to of recipients) {
    await sendMail({
      to,
      subject,
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`
    });
  }
  return recipients.length;
}

export async function sendDocumentReminder(
  companyId: mongoose.Types.ObjectId,
  input: {
    customerId: string;
    customerName: string;
    reference: string;
    missingDocuments: string[];
    actorUserId?: mongoose.Types.ObjectId | null;
    mode?: "automatic" | "manual";
  }
): Promise<{ to: string[] }> {
  const mode = input.mode ?? "manual";
  const recipients = await resolveProcessRecipients({
    companyId,
    customerId: input.customerId,
    processLabel: LABEL_MISSING_DOCS,
    senderEmail: await senderEmail(input.actorUserId),
    mode
  });
  const declaration = await DeclarationModel.findOne({
    companyId,
    "operation.customerId": input.customerId,
    "operation.ref": input.reference.trim()
  });
  const values = declaration
    ? await declarationMailVariables(
      companyId,
      declaration,
      mode === "automatic" ? input.missingDocuments : undefined
    )
    : renderMailVariables({
      customerName: input.customerName,
      reference: input.reference,
      missingDocuments: input.missingDocuments
    });
  const sent = await deliverProcessMail({
    companyId,
    processStep: "eksik-evrak",
    recipients,
    manual: mode === "manual",
    values,
    fallbackSubject: "Eksik evrak hatırlatması · {referans}",
    fallbackBody: "Sayın {musteri},\n\n{referans} dosyasında bekleyen evraklar: {eksik_evraklar}.\n\nİyi çalışmalar."
  });
  return { to: sent > 0 ? recipients : [] };
}

export async function remindCustomerGtip(
  companyId: mongoose.Types.ObjectId,
  declarationId: string,
  actorUserId: mongoose.Types.ObjectId | null | undefined,
  input: { mode: "automatic" | "manual"; allowMatching?: boolean }
): Promise<{ to: string[] }> {
  if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz beyanname id.");
  const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId });
  if (!declaration?.operation?.customerId) throw new HttpError(404, "Beyanname bulunamadı.");
  const lines = ((declaration.normalizedData as { goodsLines?: GtipGoodsLine[] } | undefined)?.goodsLines ?? []);
  const records = await MaterialRecordModel.find({ companyId, customerId: declaration.operation.customerId })
    .select({ materialNo: 1, gtipNo: 1, status: 1, pendingUpdate: 1 })
    .lean<GtipMaterialRow[]>();
  const clean = gtipMatchIsClean(lines, records);
  if (clean && !input.allowMatching) {
    if (input.mode === "manual") throw new HttpError(409, "GTİP eksik veya hatalı değil.");
    return { to: [] };
  }
  const recipients = await resolveProcessRecipients({
    companyId,
    customerId: declaration.operation.customerId,
    processLabel: LABEL_GTIP,
    senderEmail: await senderEmail(actorUserId),
    mode: input.mode
  });
  const faultSummary = gtipFaultSummary(lines, records);
  const values = await declarationMailVariables(companyId, declaration);
  values["{gtip_sonuc}"] = faultSummary || (input.allowMatching ? "Müşteriden GTİP teyidi istendi." : "");
  const sent = await deliverProcessMail({
    companyId,
    processStep: "gtip-kontrol",
    recipients,
    manual: input.mode === "manual",
    values,
    fallbackSubject: "GTİP eksik/hatalı · {referans}",
    fallbackBody: "Sayın {musteri},\n\n{referans} dosyasında GTİP sonucu: {gtip_sonuc}.\n\nİyi çalışmalar."
  });
  return { to: sent > 0 ? recipients : [] };
}

export async function runGtipIdleReminders(now = new Date()): Promise<number> {
  if (!env.mailEnabled) return 0;
  const idleBefore = new Date(now.getTime() - TWO_HOURS_MS);
  const files = await DeclarationModel.find({
    "operation.isArchived": { $ne: true },
    "operation.fileStatus": { $nin: ["kapandi"] },
    updatedAt: { $lte: idleBefore }
  }).select({ _id: 1, companyId: 1, updatedAt: 1 }).lean();
  const dateKey = istanbulClock(now).dateKey;
  let sent = 0;
  for (const file of files) {
    const slotKey = `gtip:${dateKey}`;
    const claimed = await DocumentReminderDispatchModel.updateOne(
      { declarationId: file._id, ruleId: "gtip-kontrol", slotKey },
      { $setOnInsert: { companyId: file.companyId, declarationId: file._id, ruleId: "gtip-kontrol", slotKey, sentAt: now } },
      { upsert: true }
    );
    if (claimed.upsertedCount !== 1) continue;
    try {
      const result = await remindCustomerGtip(file.companyId, String(file._id), null, { mode: "automatic" });
      if (result.to.length === 0) {
        await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId: "gtip-kontrol", slotKey });
        continue;
      }
      sent += 1;
    } catch (error) {
      await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId: "gtip-kontrol", slotKey });
      console.error(JSON.stringify({
        event: "gtip-reminder.failed",
        message: error instanceof Error ? error.message : "GTİP hatırlatması gönderilemedi"
      }));
    }
  }
  return sent;
}

export async function notifyFileCreated(input: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  customerId: string;
  customerName: string;
  reference: string;
  fileStatus: string;
  createdBy?: mongoose.Types.ObjectId | null;
}): Promise<void> {
  if (input.fileStatus !== "yeni-talep" || !input.customerId) return;
  const claimed = await DocumentReminderDispatchModel.updateOne(
    { declarationId: input.declarationId, ruleId: PROCESS_FILE_CREATED, slotKey: "created" },
    {
      $setOnInsert: {
        companyId: input.companyId,
        declarationId: input.declarationId,
        ruleId: PROCESS_FILE_CREATED,
        slotKey: "created",
        sentAt: new Date()
      }
    },
    { upsert: true }
  );
  if (claimed.upsertedCount !== 1) return;

  try {
    const recipients = await resolveProcessRecipients({
      companyId: input.companyId,
      customerId: input.customerId,
      processLabel: LABEL_FILE_CREATED,
      senderEmail: await senderEmail(input.createdBy),
      mode: "automatic"
    });
    const created = await DeclarationModel.findById(input.declarationId);
    const values = created
      ? await declarationMailVariables(input.companyId, created)
      : renderMailVariables({ customerName: input.customerName, reference: input.reference });
    const sent = await deliverProcessMail({
      companyId: input.companyId,
      processStep: PROCESS_FILE_CREATED,
      recipients,
      values,
      fallbackSubject: "Dosya oluşturuldu · {referans}",
      fallbackBody: "Sayın {musteri},\n\n{referans} referanslı dosya yeni talep olarak oluşturuldu.\n\nİyi çalışmalar."
    });
    if (sent === 0) {
      await DocumentReminderDispatchModel.deleteOne({
        declarationId: input.declarationId,
        ruleId: PROCESS_FILE_CREATED,
        slotKey: "created"
      });
    }
  } catch (error) {
    await DocumentReminderDispatchModel.deleteOne({
      declarationId: input.declarationId,
      ruleId: PROCESS_FILE_CREATED,
      slotKey: "created"
    });
    console.error(JSON.stringify({
      event: "file-created-mail.failed",
      ref: input.reference,
      message: error instanceof Error ? error.message : "Dosya oluşturuldu maili gönderilemedi"
    }));
  }
}
