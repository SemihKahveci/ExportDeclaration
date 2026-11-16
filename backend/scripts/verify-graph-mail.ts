/**
 * Microsoft Graph mail smoke test.
 *
 * Kullanım:
 *   npx tsx backend/scripts/verify-graph-mail.ts [alici@ornek.com]
 *
 * .env içinde MS_GRAPH_* + MAIL_ENABLED=true + MAIL_PROVIDER=graph gerekir.
 */
import { env } from "../src/config/env.js";
import { sendMail } from "../src/modules/mail/mail.service.js";
import { isMicrosoftGraphMailConfigured } from "../src/modules/mail/microsoftGraphMail.service.js";

async function main() {
  const to = (process.argv[2] || env.newUserNotifyEmail || "").trim();
  console.log("[verify-graph-mail] MAIL_PROVIDER=", env.mailProvider);
  console.log("[verify-graph-mail] graphConfigured=", isMicrosoftGraphMailConfigured());
  console.log("[verify-graph-mail] sender=", env.msGraphSender || env.mailFrom);
  console.log("[verify-graph-mail] to=", to || "(yok)");

  if (!env.mailEnabled) {
    throw new Error("MAIL_ENABLED=false");
  }
  if (!isMicrosoftGraphMailConfigured()) {
    throw new Error("MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET / SENDER eksik.");
  }
  if (!to) {
    throw new Error("Alıcı yok. Argüman veya NEW_USER_NOTIFY_EMAIL verin.");
  }

  await sendMail({
    to,
    subject: "Export Declaration — Graph mail testi",
    text: "Bu mesaj Microsoft Graph OAuth (client credentials) ile gönderildi.",
    html: "<p>Bu mesaj <strong>Microsoft Graph OAuth</strong> (client credentials) ile gönderildi.</p>",
  });
  console.log("[verify-graph-mail] OK — mail gönderildi.");
}

main().catch((err) => {
  console.error("[verify-graph-mail] FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
