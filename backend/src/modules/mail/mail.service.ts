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