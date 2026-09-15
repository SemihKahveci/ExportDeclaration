import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { HttpError } from "./errorHandler.js";
import { AppUserModel, type AppUserDoc } from "../../modules/users/user.model.js";
import { verifySessionToken } from "../../modules/auth/sessionToken.js";
import { env } from "../../config/env.js";

export interface AuthContext {
  companyId: mongoose.Types.ObjectId | null;
  operationalCompanyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  systemRole: AppUserDoc["systemRole"];
  capabilities: string[];
  operationTypes: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.header("cookie");
  if (!raw) return undefined;

  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return undefined;
}

export async function authContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.method === "OPTIONS") {
      next();
      return;
    }

    const token = readCookie(req, env.authCookieName);
    const payload = token ? verifySessionToken(token) : null;

    if (!payload || !mongoose.isValidObjectId(payload.sub)) {
      next(
        new HttpError(
          401,
          "Oturum bulunamadı veya süresi dolmuş."
        )
      );
      return;
    }

    const user = await AppUserModel.findOne({
      _id: payload.sub,
      status: "Aktif"
    });

    if (!user) {
      next(
        new HttpError(
          401,
          "Kullanıcı aktif değil veya bulunamadı."
        )
      );
      return;
    }

    const isSuperAdmin = user.systemRole === "SUPERADMIN";

    if (!isSuperAdmin) {
      if (
        !user.companyId ||
        !payload.companyId ||
        !mongoose.isValidObjectId(payload.companyId) ||
        String(user.companyId) !== payload.companyId
      ) {
        next(
          new HttpError(
            401,
            "Oturum firma bilgisi geçersiz."
          )
        );
        return;
      }
    }

    let operationalCompanyId: mongoose.Types.ObjectId;

    if (isSuperAdmin) {
      if (!mongoose.isValidObjectId(env.installationCompanyId)) {
        next(
          new HttpError(
            500,
            "INSTALLATION_COMPANY_ID yapılandırılmamış veya geçersiz."
          )
        );
        return;
      }
      operationalCompanyId = new mongoose.Types.ObjectId(env.installationCompanyId);
    } else {
      operationalCompanyId = user.companyId as mongoose.Types.ObjectId;
    }

    req.auth = {
      companyId: user.companyId ?? null,
      operationalCompanyId,
      userId: user._id as mongoose.Types.ObjectId,
      systemRole: user.systemRole ?? "USER",
      capabilities: user.capabilities ?? [],
      operationTypes: user.operationTypes ?? []
    };

    next();
  } catch (err) {
    next(err);
  }
}