import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { env } from "../../config/env.js";
import { listMails } from "../customers/customer.service.js";
import { MailTemplateModel } from "../mail-templates/mailTemplate.model.js";

export interface SendMailInput {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

function createTransporter() {
  if (!env.smtpHost) {
    throw new Error("SMTP_HOST tanımlı değil.");
  }

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth:
      env.smtpUser && env.smtpPass
        ? {
            user: env.smtpUser,
            pass: env.smtpPass
          }
        : undefined
  });
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!env.mailEnabled) {
    console.log("[mail] Mail gönderimi kapalı.");
    return;
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: {
      name: env.mailFromName,
      address: env.mailFrom
    },
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}

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

export async function sendDocumentReminder(
  companyId: mongoose.Types.ObjectId,
  input: {
    customerId: string;
    to: string;
    customerName: string;
    reference: string;
    missingDocuments: string[];
  }
): Promise<{ to: string }> {
  if (!env.mailEnabled) {
    throw new HttpError(409, "Mail gönderimi kapalı.");
  }
  const target = input.to.trim().toLowerCase();
  const saved = await listMails(companyId, input.customerId);
  const allowed = saved.some((mail) => mail.email.trim().toLowerCase() === target);
  if (!target || !allowed) {
    throw new HttpError(400, "Bu müşteriye kayıtlı bir mail adresi seçilmedi.");
  }

  const missing = input.missingDocuments.map((item) => item.trim()).filter(Boolean);
  const values: Record<string, string> = {
    "{musteri}": input.customerName.trim() || "Müşteri",
    "{referans}": input.reference.trim(),
    "{beyanname_no}": input.reference.trim(),
    "{eksik_evraklar}": missing.join(", ") || "Eksik evrak",
    "{gtip_sonuc}": "",
    "{tescil_no}": "",
    "{kapanis_durumu}": "",
    "{tarih}": new Date().toLocaleDateString("tr-TR"),
    "{sorumlu}": ""
  };
  const template = await MailTemplateModel.findOne({
    companyId,
    processStep: "eksik-evrak",
    active: true
  }).sort({ updatedAt: -1 });
  const subject = fillTemplate(
    template?.subject?.trim() || "Eksik evrak hatırlatması · {referans}",
    values
  );
  const text = fillTemplate(
    template?.body?.trim() ||
      "Sayın {musteri},\n\n{referans} dosyasında bekleyen evraklar: {eksik_evraklar}.\n\nİyi çalışmalar.",
    values
  );
  await sendMail({
    to: target,
    subject,
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`
  });
  return { to: target };
}

export async function sendNewUserCredentialsMail(input: {
  fullName: string;
  username: string;
  password: string;
  email: string;
}): Promise<void> {
  const to = env.newUserNotifyEmail.trim();
  if (!to) {
    console.log("[mail] NEW_USER_NOTIFY_EMAIL boş, yeni kullanıcı maili gönderilmedi.");
    return;
  }

  await sendMail({
    to,
    subject: `Yeni kullanıcı: ${input.fullName}`,
    text: [
      "Yeni bir kullanıcı oluşturuldu.",
      "",
      `Ad Soyad: ${input.fullName}`,
      `E-posta: ${input.email}`,
      `Kullanıcı adı: ${input.username}`,
      `Şifre: ${input.password}`
    ].join("\n"),
    html: `
      <h2>Yeni kullanıcı oluşturuldu</h2>
      <p><strong>Ad Soyad:</strong> ${input.fullName}</p>
      <p><strong>E-posta:</strong> ${input.email}</p>
      <p><strong>Kullanıcı adı:</strong> ${input.username}</p>
      <p><strong>Şifre:</strong> ${input.password}</p>
    `
  });
}
