import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

interface SessionPayload {
  sub: string;
  companyId: string | null;
  /** passwordChangedAt unix seconds; şifre değişince eski oturum düşer */
  pwd: number;
  iat: number;
  exp: number;
}

export function passwordVersion(changedAt: Date | null | undefined): number {
  if (!changedAt || Number.isNaN(changedAt.getTime())) return 0;
  return Math.floor(changedAt.getTime() / 1000);
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function signPart(value: string): string {
  return createHmac("sha256", env.authJwtSecret).update(value).digest("base64url");
}

export function createSessionToken(
  userId: string,
  companyId: string | null,
  changedAt?: Date | null
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  );

  const payload: SessionPayload = {
    sub: userId,
    companyId,
    pwd: passwordVersion(changedAt),
    iat: now,
    exp: now + env.authSessionHours * 60 * 60
  };

  const body = `${header}.${b64url(JSON.stringify(payload))}`;

  return `${body}.${signPart(body)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  const body = `${header}.${payload}`;
  const expected = signPart(body);

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (
    sigBuf.length !== expBuf.length ||
    !timingSafeEqual(sigBuf, expBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);

    if (!parsed.sub || !parsed.exp || parsed.exp <= now) {
      return null;
    }

    if (
      parsed.companyId !== null &&
      typeof parsed.companyId !== "string"
    ) {
      return null;
    }

    if (typeof parsed.pwd !== "number" || !Number.isFinite(parsed.pwd) || parsed.pwd < 0) {
      parsed.pwd = 0;
    }

    return parsed;
  } catch {
    return null;
  }
}