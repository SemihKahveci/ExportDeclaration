import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  APPROVER_LEVELS,
  APP_USER_ROLES,
  APP_USER_STATUSES,
  AppUserModel,
  type AppUserDoc
} from "./user.model.js";
import { toAppUserDto, type AppUserDto } from "./user.mapper.js";
import { setPassword } from "../auth/auth.service.js";
import { sendNewUserCredentialsMail } from "../mail/mail.service.js";
import { CustomerModel } from "../customers/customer.models.js";

export type CreateAppUserInput = Omit<AppUserDto, "id" | "createdAt" | "updatedAt" | "systemRole"> & { password?: string };
export type UpdateAppUserInput = Partial<Omit<CreateAppUserInput, "password">> & { password?: string };

function assertRole(v: unknown): asserts v is AppUserDoc["role"] {
  if (typeof v !== "string" || !APP_USER_ROLES.includes(v as AppUserDoc["role"])) {
    throw new HttpError(400, `Geçersiz rol: ${String(v)}`);
  }
}

function assertStatus(v: unknown): asserts v is AppUserDoc["status"] {
  if (typeof v !== "string" || !APP_USER_STATUSES.includes(v as AppUserDoc["status"])) {
    throw new HttpError(400, `Geçersiz durum: ${String(v)}`);
  }
}

function assertApproverLevel(v: unknown): asserts v is AppUserDoc["approverLevel"] {
  if (typeof v !== "string" || !APPROVER_LEVELS.includes(v as AppUserDoc["approverLevel"])) {
    throw new HttpError(400, `Geçersiz onay seviyesi: ${String(v)}`);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pickWritableFields(body: UpdateAppUserInput): Partial<AppUserDoc> {
  const patch: Partial<AppUserDoc> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  // E-posta oluşturma sonrası değiştirilemez
  if (body.role !== undefined) { assertRole(body.role); patch.role = body.role; }
  if (body.status !== undefined) { assertStatus(body.status); patch.status = body.status; }
  if (body.capabilities !== undefined) patch.capabilities = body.capabilities;
  if (body.operationTypes !== undefined) patch.operationTypes = body.operationTypes;
  if (body.menuAccess !== undefined) patch.menuAccess = body.menuAccess;
  if (body.menuActions !== undefined) patch.menuActions = body.menuActions;
  if (body.approverLevel !== undefined) { assertApproverLevel(body.approverLevel); patch.approverLevel = body.approverLevel; }
  if (body.specialActions !== undefined) patch.specialActions = body.specialActions;
  if (body.screenPermissions !== undefined) patch.screenPermissions = body.screenPermissions;
  return patch;
}

export async function listAppUsers(companyId: mongoose.Types.ObjectId): Promise<AppUserDto[]> {
  const rows = await AppUserModel.find({ companyId }).sort({ systemRole: 1, createdAt: -1 });
  return rows.map((row) => toAppUserDto(row));
}

/** MT atama vb. için sade liste — yetki yönetimi alanları yok. */
export type AssignableUserDto = {
  id: string;
  name: string;
  role: AppUserDoc["role"];
  status: AppUserDoc["status"];
};

export async function listAssignableUsers(companyId: mongoose.Types.ObjectId): Promise<AssignableUserDto[]> {
  const rows = await AppUserModel.find({ companyId, status: "Aktif" })
    .select("name role status")
    .sort({ name: 1 });
  return rows.map((row) => ({
    id: String(row._id),
    name: row.name,
    role: row.role,
    status: row.status,
  }));
}

function toUsername(name: string): string {
  return name.replace(/\s+/g, "");
}

function generateSixDigitPassword(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createAppUser(companyId: mongoose.Types.ObjectId, body: CreateAppUserInput): Promise<AppUserDto> {
  if (!body.name?.trim()) throw new HttpError(400, "Ad soyad gerekli.");
  if (!body.email?.trim()) throw new HttpError(400, "E-posta gerekli.");
  assertRole(body.role);
  assertStatus(body.status ?? "Aktif");
  assertApproverLevel(body.approverLevel ?? "none");

  const fullName = body.name.trim();
  const password = generateSixDigitPassword();

  const created = new AppUserModel({
    companyId,
    name: fullName,
    email: normalizeEmail(body.email),
    systemRole: "USER",
    role: body.role,
    status: body.status ?? "Aktif",
    capabilities: body.capabilities ?? [],
    operationTypes: body.operationTypes ?? [],
    menuAccess: body.menuAccess ?? [],
    menuActions: body.menuActions ?? {},
    approverLevel: body.approverLevel ?? "none",
    specialActions: body.specialActions ?? [],
    screenPermissions: body.screenPermissions ?? {}
  });
  await setPassword(created, password);

  try {
    await created.save();
  } catch (err) {
    if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
      throw new HttpError(409, "Bu e-posta adresi bu firmada zaten kayıtlı.");
    }
    throw err;
  }

  try {
    await sendNewUserCredentialsMail({
      fullName,
      username: toUsername(fullName),
      password,
      email: created.email
    });
  } catch (err) {
    console.error("[mail] Yeni kullanıcı bilgileri gönderilemedi:", err);
  }

  return toAppUserDto(created);
}

export async function updateAppUser(companyId: mongoose.Types.ObjectId, userId: string, body: UpdateAppUserInput): Promise<AppUserDto> {
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "Geçersiz kullanıcı id.");
  const user = await AppUserModel.findOne({ _id: userId, companyId }).select("+passwordHash");
  if (!user) throw new HttpError(404, "Kullanıcı bulunamadı.");

  const patch = pickWritableFields(body);
  Object.assign(user, patch);
  if (body.password) await setPassword(user, body.password);
  if (Object.keys(patch).length === 0 && !body.password) throw new HttpError(400, "Güncellenecek alan yok.");

  try {
    await user.save();
    return toAppUserDto(user);
  } catch (err) {
    if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
      throw new HttpError(409, "Bu e-posta adresi bu firmada zaten kayıtlı.");
    }
    throw err;
  }
}

export async function deleteAppUser(
  companyId: mongoose.Types.ObjectId,
  userId: string,
  actorUserId: mongoose.Types.ObjectId,
): Promise<void> {
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "Geçersiz kullanıcı id.");
  if (String(userId) === String(actorUserId)) {
    throw new HttpError(400, "Kendi hesabınızı silemezsiniz.");
  }

  const user = await AppUserModel.findOne({ _id: userId, companyId });
  if (!user) throw new HttpError(404, "Kullanıcı bulunamadı.");
  if (user.systemRole === "SUPERADMIN") {
    throw new HttpError(403, "Süper Admin silinemez.");
  }

  await AppUserModel.deleteOne({ _id: userId, companyId });

  await CustomerModel.updateMany(
    { companyId, assignedMtUserId: userId },
    { $unset: { assignedMtUserId: 1 } },
  );
  await CustomerModel.updateMany(
    { companyId, assignedMtManagerUserId: userId },
    { $unset: { assignedMtManagerUserId: 1 } },
  );
}
