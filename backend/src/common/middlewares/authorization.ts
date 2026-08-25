import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler.js";

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new HttpError(401, "Oturum gerekli."));
    return;
  }
  if (req.auth.systemRole !== "SUPERADMIN") {
    next(new HttpError(403, "Bu işlem yalnızca Süper Admin tarafından yapılabilir."));
    return;
  }
  next();
}

function hasAny(req: Request, required: string[]): boolean {
  if (req.auth?.systemRole === "SUPERADMIN") return true;
  const current = new Set(req.auth?.capabilities ?? []);
  return required.some((cap) => current.has(cap));
}

export function requireAnyCapability(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new HttpError(401, "Oturum gerekli."));
      return;
    }
    if (required.length === 0 || hasAny(req, required)) {
      next();
      return;
    }
    next(new HttpError(403, "Bu ekran veya işlem için yetkiniz bulunmuyor."));
  };
}

export function requireReadWriteCapabilities(read: string[], write: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new HttpError(401, "Oturum gerekli."));
      return;
    }
    const required = ["GET", "HEAD"].includes(req.method) ? read : write;
    if (req.auth.systemRole === "SUPERADMIN" || hasAny(req, required)) {
      next();
      return;
    }
    next(new HttpError(403, "Bu işlem için yetkiniz bulunmuyor."));
  };
}
