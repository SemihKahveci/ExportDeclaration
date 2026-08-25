import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { AppUserModel } from "../users/user.model.js";
import { hashPassword } from "./password.js";

export async function bootstrapSuperAdmin(): Promise<void> {
  const email = env.superAdminEmail.trim().toLowerCase();
  const password = env.superAdminPassword;
  if (!email || !password) return;

  const existing = await AppUserModel.findOne({ email }).select("+passwordHash");
  if (existing) {
    let changed = false;
    if (existing.systemRole !== "SUPERADMIN") {
      existing.systemRole = "SUPERADMIN";
      changed = true;
    }
    if (!existing.passwordHash || env.superAdminResetPassword) {
      existing.passwordHash = await hashPassword(password);
      existing.passwordChangedAt = new Date();
      changed = true;
    }
    if (existing.status !== "Aktif") {
      existing.status = "Aktif";
      changed = true;
    }
    if (changed) await existing.save();
    console.log(`[auth] Superadmin hazır: ${email}`);
    return;
  }

  if (!mongoose.isValidObjectId(env.superAdminCompanyId)) {
    console.warn("[auth] SUPERADMIN_EMAIL/PASSWORD tanımlı fakat SUPERADMIN_COMPANY_ID geçerli değil; kullanıcı oluşturulmadı.");
    return;
  }

  await AppUserModel.create({
    companyId: new mongoose.Types.ObjectId(env.superAdminCompanyId),
    name: env.superAdminName || "Süper Admin",
    email,
    passwordHash: await hashPassword(password),
    passwordChangedAt: new Date(),
    systemRole: "SUPERADMIN",
    role: "Admin",
    status: "Aktif",
    capabilities: [],
    operationTypes: ["ithalat", "ihracat", "transit", "antrepo"],
    menuAccess: [],
    menuActions: {},
    approverLevel: "second",
    specialActions: [],
    screenPermissions: {}
  });
  console.log(`[auth] Superadmin oluşturuldu: ${email}`);
}
