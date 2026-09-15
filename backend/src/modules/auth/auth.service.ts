import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { AppUserModel, type AppUserDoc } from "../users/user.model.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionToken } from "./sessionToken.js";

export interface AuthUserDto {
  id: string;
  companyId: string | null;
  name: string;
  email: string;
  systemRole: AppUserDoc["systemRole"];
  role: AppUserDoc["role"];
  capabilities: string[];
  operationTypes: string[];
}

export function toAuthUserDto(user: AppUserDoc): AuthUserDto {
  return {
    id: String(user._id),
    companyId: user.companyId ? String(user.companyId) : null,
    name: user.name,
    email: user.email,
    systemRole: user.systemRole ?? "USER",
    role: user.role,
    capabilities: user.capabilities ?? [],
    operationTypes: user.operationTypes ?? []
  };
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUserDto }> {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new HttpError(400, "E-posta ve şifre gerekli.");
  }

  const matches = await AppUserModel.find({ email: normalizedEmail })
    .select("+passwordHash")
    .limit(2);

  if (matches.length === 0) {
    throw new HttpError(401, "E-posta veya şifre hatalı.");
  }

  if (matches.length > 1) {
    throw new HttpError(
      409,
      "Bu e-posta birden fazla kullanıcı kaydında mevcut. Sistem yöneticisine başvurun."
    );
  }

  const user = matches[0]!;

  if (user.status !== "Aktif") {
    throw new HttpError(403, "Kullanıcı hesabı pasif.");
  }

  if (!user.passwordHash) {
    throw new HttpError(
      403,
      "Bu kullanıcı için henüz giriş şifresi tanımlanmamış."
    );
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "E-posta veya şifre hatalı.");
  }

  if (user.systemRole !== "SUPERADMIN" && !user.companyId) {
    throw new HttpError(
      403,
      "Kullanıcının bağlı olduğu firma bulunamadı."
    );
  }

  user.lastLoginAt = new Date();
  await user.save();

  const companyId = user.companyId
    ? String(user.companyId)
    : null;

  return {
    token: createSessionToken(String(user._id), companyId),
    user: toAuthUserDto(user)
  };
}

export async function getAuthUser(
  userId: mongoose.Types.ObjectId
): Promise<AuthUserDto> {
  const user = await AppUserModel.findOne({
    _id: userId,
    status: "Aktif"
  });

  if (!user) {
    throw new HttpError(401, "Kullanıcı bulunamadı.");
  }

  if (user.systemRole !== "SUPERADMIN" && !user.companyId) {
    throw new HttpError(
      401,
      "Kullanıcının bağlı olduğu firma bulunamadı."
    );
  }

  return toAuthUserDto(user);
}

export async function setPassword(
  user: AppUserDoc,
  password: string
): Promise<void> {
  try {
    user.passwordHash = await hashPassword(password);
  } catch (err) {
    throw new HttpError(
      400,
      err instanceof Error ? err.message : "Geçersiz şifre."
    );
  }

  user.passwordChangedAt = new Date();
}