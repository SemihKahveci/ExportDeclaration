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

export type CreateAppUserInput = Omit<AppUserDto, "id" | "createdAt" | "updatedAt">;
export type UpdateAppUserInput = Partial<CreateAppUserInput>;

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
  if (body.email !== undefined) patch.email = normalizeEmail(String(body.email));
  if (body.role !== undefined) {
    assertRole(body.role);
    patch.role = body.role;
  }
  if (body.status !== undefined) {
    assertStatus(body.status);
    patch.status = body.status;
  }
  if (body.capabilities !== undefined) patch.capabilities = body.capabilities;
  if (body.operationTypes !== undefined) patch.operationTypes = body.operationTypes;
  if (body.menuAccess !== undefined) patch.menuAccess = body.menuAccess;
  if (body.menuActions !== undefined) patch.menuActions = body.menuActions;
  if (body.approverLevel !== undefined) {
    assertApproverLevel(body.approverLevel);
    patch.approverLevel = body.approverLevel;
  }
  if (body.specialActions !== undefined) patch.specialActions = body.specialActions;
  if (body.screenPermissions !== undefined) patch.screenPermissions = body.screenPermissions;

  return patch;
}

export async function listAppUsers(companyId: mongoose.Types.ObjectId): Promise<AppUserDto[]> {
  const rows = await AppUserModel.find({ companyId }).sort({ createdAt: -1 });
  return rows.map((row) => toAppUserDto(row));
}

export async function createAppUser(
  companyId: mongoose.Types.ObjectId,
  body: CreateAppUserInput
): Promise<AppUserDto> {
  if (!body.name?.trim()) throw new HttpError(400, "Ad soyad gerekli.");
  if (!body.email?.trim()) throw new HttpError(400, "E-posta gerekli.");

  assertRole(body.role);
  assertStatus(body.status ?? "Aktif");
  assertApproverLevel(body.approverLevel ?? "none");

  try {
    const created = await AppUserModel.create({
      companyId,
      name: body.name.trim(),
      email: normalizeEmail(body.email),
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
    return toAppUserDto(created);
  } catch (err) {
    if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
      throw new HttpError(409, "Bu e-posta adresi bu firmada zaten kayıtlı.");
    }
    throw err;
  }
}

export async function updateAppUser(
  companyId: mongoose.Types.ObjectId,
  userId: string,
  body: UpdateAppUserInput
): Promise<AppUserDto> {
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "Geçersiz kullanıcı id.");

  const patch = pickWritableFields(body);
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "Güncellenecek alan yok.");
  }

  try {
    const updated = await AppUserModel.findOneAndUpdate(
      { _id: userId, companyId },
      { $set: patch },
      { new: true, runValidators: true }
    );
    if (!updated) throw new HttpError(404, "Kullanıcı bulunamadı.");
    return toAppUserDto(updated);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
      throw new HttpError(409, "Bu e-posta adresi bu firmada zaten kayıtlı.");
    }
    throw err;
  }
}
