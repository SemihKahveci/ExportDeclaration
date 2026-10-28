import mongoose from "mongoose";
import { env } from "../../config/env.js";
import {
  CustomerDocumentRuleModel,
  CustomerMailModel,
  type CustomerDocumentRuleDoc,
  type CustomerMailDoc
} from "../customers/customer.models.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { missingDocsFromRule, ruleCoversFile } from "../declarations/declaration.service.js";
import { UploadedDocumentModel } from "../documents/document.model.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { dueReminderSlot } from "./documentReminderSchedule.js";
import { sendDocumentReminder } from "./mail.service.js";

const TICK_MS = 60_000;
const REMINDER_PROCESS = "Eksik Evrak Hatırlatma";

function activeAddresses(rows: Array<{ email?: string; status?: string; matchStatus?: string; notificationProcesses?: string[] }>): string[] {
  const active = rows.filter((row) => row.status !== "passive" && row.matchStatus !== "passive" && row.email?.trim());
  const tagged = active.filter((row) => (row.notificationProcesses ?? []).includes(REMINDER_PROCESS));
  const chosen = tagged.length > 0 ? tagged : active;
  return [...new Set(chosen.map((row) => String(row.email).trim().toLowerCase()))];
}

export async function runDocumentReminders(now = new Date()): Promise<number> {
  if (!env.mailEnabled) return 0;
  const files = await DeclarationModel.find({
    "operation.isArchived": { $ne: true },
    "operation.fileStatus": { $nin: ["kapandi"] },
    "operation.customerId": { $nin: [null, ""] }
  }).select({ companyId: 1, operation: 1 }).lean();
  if (files.length === 0) return 0;

  const byCompany = new Map<string, typeof files>();
  for (const file of files) {
    const key = String(file.companyId);
    const group = byCompany.get(key) ?? [];
    group.push(file);
    byCompany.set(key, group);
  }

  let sent = 0;
  for (const [companyKey, group] of byCompany) {
    const companyId = new mongoose.Types.ObjectId(companyKey);
    const customerIds = [...new Set(group.map((file) => file.operation?.customerId).filter((id): id is string => Boolean(id)))];
    const [rules, mails, documents, dispatches] = await Promise.all([
      CustomerDocumentRuleModel.find({
        companyId,
        customerId: { $in: customerIds },
        status: "Aktif",
        reminderType: "Otomatik"
      }).lean<CustomerDocumentRuleDoc[]>(),
      CustomerMailModel.find({ companyId, customerId: { $in: customerIds } }).lean<CustomerMailDoc[]>(),
      UploadedDocumentModel.find({ companyId, declarationId: { $in: group.map((file) => file._id) } }).select({ declarationId: 1, type: 1 }).lean(),
      DocumentReminderDispatchModel.find({ companyId, declarationId: { $in: group.map((file) => file._id) } }).select({ declarationId: 1, ruleId: 1, slotKey: 1 }).lean()
    ]);

    const typesByFile = new Map<string, Set<string>>();
    for (const doc of documents) {
      const id = String(doc.declarationId);
      const types = typesByFile.get(id) ?? new Set<string>();
      types.add(String(doc.type));
      typesByFile.set(id, types);
    }
    const sentByFile = new Map<string, Set<string>>();
    for (const row of dispatches) {
      const id = `${row.declarationId}:${row.ruleId}`;
      const slots = sentByFile.get(id) ?? new Set<string>();
      slots.add(row.slotKey);
      sentByFile.set(id, slots);
    }
    const mailsByCustomer = new Map<string, typeof mails>();
    for (const mail of mails) {
      const list = mailsByCustomer.get(mail.customerId) ?? [];
      list.push(mail);
      mailsByCustomer.set(mail.customerId, list);
    }

    for (const file of group) {
      const operation = file.operation;
      const customerId = operation?.customerId;
      if (!operation || !customerId) continue;
      const receivedAt = operation.receivedAt ? new Date(operation.receivedAt) : null;
      if (!receivedAt || Number.isNaN(receivedAt.getTime())) continue;
      const uploaded = typesByFile.get(String(file._id)) ?? new Set<string>();
      const addresses = activeAddresses(mailsByCustomer.get(customerId) ?? []);
      if (addresses.length === 0) continue;

      for (const rule of rules) {
        if (rule.customerId !== customerId) continue;
        if (!ruleCoversFile(rule, operation.operationType, operation.transportMode)) continue;
        const missing = missingDocsFromRule(rule.requiredDocs, uploaded);
        if (missing.length === 0) continue;
        const ruleId = String(rule._id);
        const slot = dueReminderSlot({
          frequency: rule.frequency ?? "",
          receivedAt,
          cutoffAt: operation.cutoffAt ? new Date(operation.cutoffAt) : null,
          now,
          sent: sentByFile.get(`${file._id}:${ruleId}`) ?? new Set()
        });
        if (!slot) continue;

        const claimed = await DocumentReminderDispatchModel.updateOne(
          { declarationId: file._id, ruleId, slotKey: slot },
          { $setOnInsert: { companyId, declarationId: file._id, ruleId, slotKey: slot, sentAt: now } },
          { upsert: true }
        );
        if (claimed.upsertedCount !== 1) continue;

        try {
          for (const to of addresses) {
            await sendDocumentReminder(companyId, {
              customerId,
              to,
              customerName: operation.customerName,
              reference: operation.ref,
              missingDocuments: missing
            });
          }
          sent += 1;
        } catch (error) {
          await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId, slotKey: slot });
          console.error(JSON.stringify({
            event: "document-reminder.failed",
            ref: operation.ref,
            message: error instanceof Error ? error.message : "Hatırlatma gönderilemedi"
          }));
        }
      }
    }
  }
  return sent;
}

let running = false;

export function startDocumentReminderJob(): void {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sent = await runDocumentReminders();
      if (sent > 0) console.log(JSON.stringify({ event: "document-reminder.sent", sent }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "document-reminder.failed",
        message: error instanceof Error ? error.message : "Evrak hatırlatma turu başarısız"
      }));
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, TICK_MS);
  timer.unref();
}
