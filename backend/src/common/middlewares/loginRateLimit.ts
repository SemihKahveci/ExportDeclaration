import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  const ip = (forwarded?.split(",")[0] ?? req.ip ?? req.socket.remoteAddress ?? "unknown").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  return `${ip}|${email}`;
}

export function loginRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = clientKey(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  current.count += 1;
  if (current.count > MAX_ATTEMPTS) {
    next(new HttpError(429, "Çok fazla giriş denemesi. Bir süre sonra tekrar deneyin."));
    return;
  }

  next();
}
