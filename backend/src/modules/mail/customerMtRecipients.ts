import mongoose from "mongoose";
import { CustomerModel } from "../customers/customer.models.js";
import { AppUserModel } from "../users/user.model.js";

/** Müşteriye atanmış aktif MT ve MT Yönetici e-postaları (bilgi / CC). */
export async function assignedMtInfoEmails(
  companyId: mongoose.Types.ObjectId,
  customerId: string
): Promise<string[]> {
  const id = customerId.trim();
  if (!id || !mongoose.isValidObjectId(id)) return [];

  const customer = await CustomerModel.findOne({ _id: id, companyId })
    .select({ assignedMtUserId: 1, assignedMtManagerUserId: 1 })
    .lean<{ assignedMtUserId?: string; assignedMtManagerUserId?: string } | null>();

  const userIds = [...new Set(
    [customer?.assignedMtUserId, customer?.assignedMtManagerUserId]
      .map((value) => String(value ?? "").trim())
      .filter((value) => mongoose.isValidObjectId(value))
  )];
  if (userIds.length === 0) return [];

  const users = await AppUserModel.find({
    _id: { $in: userIds },
    status: "Aktif"
  })
    .select({ email: 1 })
    .lean<Array<{ email?: string }>>();

  return [...new Set(
    users
      .map((user) => user.email?.trim().toLowerCase() ?? "")
      .filter(Boolean)
  )];
}

/** TO listesinde olmayan bilgi adreslerini CC olarak döndür; TO boşsa bilgi adreslerini TO yap. */
export function mergeCustomerAndMtRecipients(to: string[], info: string[]): {
  to: string[];
  cc: string[];
} {
  const primary = [...new Set(to.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const bilgi = [...new Set(info.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (primary.length === 0) {
    return { to: bilgi, cc: [] };
  }
  return {
    to: primary,
    cc: bilgi.filter((email) => !primary.includes(email))
  };
}
