import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { CustomerModel } from "../customers/customer.models.js";
import { gtipMatchIsClean, type GtipGoodsLine, type GtipMaterialRow } from "../declarations/customerGtip.service.js";
import { missingDocumentsByDeclaration } from "../declarations/declaration.service.js";
import { AppUserModel } from "../users/user.model.js";
import { MaterialRecordModel } from "../material-records/materialRecord.model.js";
import { UploadedDocumentModel } from "../documents/document.model.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { istanbulStamp } from "./summaryMailFormat.js";
import { deliverProcessMail } from "./processMail.service.js";
import type { OpenMailFile } from "./openMailFiles.js";

export const WRITING_READY_LIMIT_MS = 15 * 60 * 1000;
const RULE_ID = "yazim-hatirlatma";
const SLOT = "first";
const PROCESS_STEP = "beyanname-yazim-hatirlatma" as const;

const START_ACTIONS = new Set(["START_WRITING", "START_WRITING_WITH_MISSING_DOCUMENTS"]);

function hasStartedWriting(file: OpenMailFile): boolean {
  const history = file.operation?.workflowHistory ?? [];
  return history.some((entry) => START_ACTIONS.has(String(entry.action ?? "")));
}

function readyAtFromHistory(file: OpenMailFile): Date | null {
  const history = file.operation?.workflowHistory ?? [];
  const advanced = [...history].reverse().find((entry) =>
    entry.action === "AUTO_ADVANCE" && entry.toStatus === "beyanname-yazim"
  );
  if (!advanced?.at) return null;
  const at = new Date(advanced.at);
  return Number.isNaN(at.getTime()) ? null : at;
}

async function mtEmails(companyId: mongoose.Types.ObjectId, customerId: string): Promise<string[]> {
  const customer = await CustomerModel.findOne({ _id: customerId, companyId })
    .select({ assignedMtUserId: 1 })
    .lean<{ assignedMtUserId?: string } | null>();
  const mtId = customer?.assignedMtUserId?.trim();
  if (!mtId || !mongoose.isValidObjectId(mtId)) return [];
  const user = await AppUserModel.findOne({ _id: mtId, companyId, status: "Aktif" })
    .select({ email: 1 })
    .lean<{ email?: string } | null>();
  const email = user?.email?.trim().toLowerCase();
  return email ? [email] : [];
}

export async function runWritingReadyReminders(now = new Date(), openFiles: OpenMailFile[] = []): Promise<number> {
  if (!env.mailEnabled || openFiles.length === 0) return 0;

  const candidates = openFiles.filter((file) => {
    if (!file.operation?.customerId?.trim()) return false;
    if (hasStartedWriting(file)) return false;
    const status = file.operation.fileStatus ?? "";
    return status === "beyanname-yazim" || status === "evrak-bekleniyor" || status === "yeni-talep";
  });
  if (candidates.length === 0) return 0;

  const byCompany = new Map<string, OpenMailFile[]>();
  for (const file of candidates) {
    const key = String(file.companyId);
    const group = byCompany.get(key) ?? [];
    group.push(file);
    byCompany.set(key, group);
  }

  let sent = 0;
  for (const [companyKey, group] of byCompany) {
    const companyId = new mongoose.Types.ObjectId(companyKey);
    const customerIds = [...new Set(group.map((file) => file.operation?.customerId).filter((id): id is string => Boolean(id)))];
    const [missingByFile, documents, records, prior] = await Promise.all([
      missingDocumentsByDeclaration(companyId, group.map((file) => ({
        _id: file._id,
        operation: file.operation ? {
          customerId: file.operation.customerId,
          operationType: file.operation.operationType,
          transportMode: file.operation.transportMode
        } : null
      }))),
      UploadedDocumentModel.find({ companyId, declarationId: { $in: group.map((file) => file._id) } })
        .select({ declarationId: 1, extractionStatus: 1, updatedAt: 1 })
        .lean<Array<{ declarationId: mongoose.Types.ObjectId; extractionStatus?: string; updatedAt?: Date }>>(),
      MaterialRecordModel.find({ companyId, customerId: { $in: customerIds } })
        .select({ customerId: 1, materialNo: 1, gtipNo: 1, status: 1, pendingUpdate: 1 })
        .lean<Array<GtipMaterialRow & { customerId: string }>>(),
      DocumentReminderDispatchModel.find({
        declarationId: { $in: group.map((file) => file._id) },
        ruleId: RULE_ID
      }).select({ declarationId: 1 }).lean()
    ]);

    const already = new Set(prior.map((row) => String(row.declarationId)));
    const docsByFile = new Map<string, typeof documents>();
    for (const doc of documents) {
      const id = String(doc.declarationId);
      const rows = docsByFile.get(id) ?? [];
      rows.push(doc);
      docsByFile.set(id, rows);
    }

    for (const file of group) {
      const id = String(file._id);
      if (already.has(id)) continue;
      const docs = docsByFile.get(id) ?? [];
      const missing = missingByFile.get(id) ?? [];
      if (docs.length === 0 || missing.length > 0) continue;
      if (docs.some((doc) => doc.extractionStatus !== "SUCCESS")) continue;

      const customerId = file.operation?.customerId ?? "";
      const lines = (file.normalizedData as { goodsLines?: GtipGoodsLine[] } | undefined)?.goodsLines ?? [];
      const ownRecords = records.filter((row) => row.customerId === customerId);
      if (!gtipMatchIsClean(lines, ownRecords)) continue;

      const readyAt = readyAtFromHistory(file)
        ?? (() => {
          const times = docs
            .map((doc) => (doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0))
            .filter((value) => value > 0);
          return times.length > 0 ? new Date(Math.max(...times)) : null;
        })();
      if (!readyAt || now.getTime() - readyAt.getTime() < WRITING_READY_LIMIT_MS) continue;

      const recipients = await mtEmails(companyId, customerId);
      if (recipients.length === 0) continue;

      const claimed = await DocumentReminderDispatchModel.updateOne(
        { declarationId: file._id, ruleId: RULE_ID, slotKey: SLOT },
        { $setOnInsert: { companyId, declarationId: file._id, ruleId: RULE_ID, slotKey: SLOT, sentAt: now } },
        { upsert: true }
      );
      if (claimed.upsertedCount !== 1) continue;

      try {
        const ref = file.operation?.ref?.trim() || id;
        const count = await deliverProcessMail({
          companyId,
          processStep: PROCESS_STEP,
          recipients,
          values: {
            "{musteri}": file.operation?.customerName?.trim() || "Müşteri",
            "{referans}": ref,
            "{beyanname_no}": file.operation?.declarationNo?.trim() || "",
            "{tarih}": istanbulStamp(now, true),
            "{eksik_evraklar}": "",
            "{gtip_sonuc}": "",
            "{tescil_no}": "",
            "{kapanis_durumu}": "",
            "{sorumlu}": "",
            "{ozet_tablo}": "",
            "{cutoff}": ""
          },
          allowFallback: true,
          fallbackSubject: "Beyanname yazım hatırlatması · {referans}",
          fallbackBody: "Sayın ilgili,\n\n{referans} dosyası yazıma hazır. Parse tamamlandıktan sonra 15 dakika geçti; henüz beyanname yazımına başlanmadı.\n\nİyi çalışmalar."
        });
        if (count === 0) {
          await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId: RULE_ID, slotKey: SLOT });
          continue;
        }
        sent += 1;
      } catch (error) {
        await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId: RULE_ID, slotKey: SLOT });
        console.error(JSON.stringify({
          event: "writing-ready-reminder.failed",
          ref: file.operation?.ref,
          message: error instanceof Error ? error.message : "Yazım hatırlatması gönderilemedi"
        }));
      }
    }
  }
  return sent;
}
