import { env } from "../../config/env.js";

export type GraphSendMailInput = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
};

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

export function isMicrosoftGraphMailConfigured(): boolean {
  return Boolean(
    env.msGraphTenantId
      && env.msGraphClientId
      && env.msGraphClientSecret
      && (env.msGraphSender || env.mailFrom)
  );
}

function normalizeAddresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function toRecipients(addresses: string[]) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

async function getClientCredentialsToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.msGraphTenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.msGraphClientId,
    client_secret: env.msGraphClientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Microsoft Graph token alınamadı (${response.status}): ${payload.error_description || payload.error || "unknown"}`
    );
  }

  const expiresInSec = Number(payload.expires_in) || 3600;
  tokenCache = {
    accessToken: payload.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return payload.access_token;
}

/**
 * Application permission Mail.Send ile mailbox adına gönderir.
 * Azure'da app'e Mail.Send (Application) + admin consent gerekir.
 */
export async function sendMailViaMicrosoftGraph(input: GraphSendMailInput): Promise<void> {
  if (!isMicrosoftGraphMailConfigured()) {
    throw new Error("Microsoft Graph mail yapılandırması eksik (TENANT/CLIENT/SECRET/SENDER).");
  }

  const sender = (env.msGraphSender || env.mailFrom).trim();
  const to = normalizeAddresses(input.to);
  if (!to.length) throw new Error("Graph mail: alıcı (to) boş.");
  const cc = normalizeAddresses(input.cc);

  const contentType = input.html?.trim() ? "HTML" : "Text";
  const content = (contentType === "HTML" ? input.html : input.text) ?? "";

  const token = await getClientCredentialsToken();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType, content },
        toRecipients: toRecipients(to),
        ...(cc.length ? { ccRecipients: toRecipients(cc) } : {}),
        from: {
          emailAddress: {
            address: sender,
            ...(env.mailFromName ? { name: env.mailFromName } : {}),
          },
        },
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Microsoft Graph sendMail başarısız (${response.status}): ${errText.slice(0, 500)}`);
  }
}
