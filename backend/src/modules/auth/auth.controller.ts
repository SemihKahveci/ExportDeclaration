import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { getAuthUser, login } from "./auth.service.js";

function cookieOptions(maxAgeSeconds: number): string {
  const parts = [
    `${env.authCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (env.nodeEnv === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  const { token, user } = await login(req.body?.email, req.body?.password);
  const maxAge = env.authSessionHours * 60 * 60;
  res.setHeader("Set-Cookie", cookieOptions(maxAge).replace(`${env.authCookieName}=`, `${env.authCookieName}=${encodeURIComponent(token)}`));
  res.json({ ok: true, data: user });
}

export async function postLogout(_req: Request, res: Response): Promise<void> {
  res.setHeader("Set-Cookie", cookieOptions(0));
  res.json({ ok: true, data: { loggedOut: true } });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await getAuthUser(req.auth!.userId);
  res.json({ ok: true, data: user });
}
