import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

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
