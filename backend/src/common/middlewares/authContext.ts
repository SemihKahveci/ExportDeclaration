import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { HttpError } from "./errorHandler.js";

export interface AuthContext {
  companyId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Sprint 1: gerçek JWT/oturum yoksa header ile bağlama.
 * Üretimde değiştirilmeli: Authorization + firma üyeliği doğrulaması.
 */
export function authContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  const companyHeader = req.header("x-company-id");
  const userHeader = req.header("x-user-id");

  if (!companyHeader || !mongoose.isValidObjectId(companyHeader)) {
    next(new HttpError(401, "x-company-id geçerli bir ObjectId olmalıdır."));
    return;
  }

  req.auth = {
    companyId: new mongoose.Types.ObjectId(companyHeader),
    userId:
      userHeader && mongoose.isValidObjectId(userHeader)
        ? new mongoose.Types.ObjectId(userHeader)
        : undefined
  };
  next();
}
