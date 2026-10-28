import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { env } from "../../config/env.js";
import { CustomerNotificationRuleModel } from "../customers/customer.models.js";
import { listMails } from "../customers/customer.service.js";
import { MailTemplateModel, type MailTemplateDoc } from "../mail-templates/mailTemplate.model.js";
import { AppUserModel } from "../users/user.model.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { sendMail } from "./mail.service.js";

export const PROCESS_FILE_CREATED = "dosya-olusturuldu";
export const LABEL_FILE_CREATED = "Dosya Oluşturuldu";

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
    const sent = await deliverProcessMail({
      companyId: input.companyId,
      processStep: PROCESS_FILE_CREATED,
      recipients,
      values: {
        "{musteri}": input.customerName.trim() || "Müşteri",
        "{referans}": input.reference.trim(),
        "{beyanname_no}": input.reference.trim(),
        "{eksik_evraklar}": "",
        "{gtip_sonuc}": "",
        "{tescil_no}": "",
        "{kapanis_durumu}": "",
        "{tarih}": new Date().toLocaleDateString("tr-TR"),
        "{sorumlu}": ""
      },
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
