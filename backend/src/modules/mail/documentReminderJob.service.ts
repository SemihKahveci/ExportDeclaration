import mongoose from "mongoose";
import { env } from "../../config/env.js";
import {
  CustomerDocumentRuleModel,
  type CustomerDocumentRuleDoc
} from "../customers/customer.models.js";
import { missingDocsFromRule, ruleCoversFile } from "../declarations/declaration.service.js";
import { UploadedDocumentModel } from "../documents/document.model.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { runCutoffAlerts, runCustomerSummaries } from "./customerSummaryJob.service.js";
import { loadOpenMailFiles, withCustomer, type OpenMailFile } from "./openMailFiles.js";
import { runGtipIdleReminders, sendDocumentReminder } from "./processMail.service.js";
import { runStageDigests } from "./stageMail.service.js";
import { runWritingReadyReminders } from "./writingReadyReminder.service.js";

const TICK_MS = 60_000;
const FIRST_SLOT = "first";

export function priorDocumentReminder(ruleIds: readonly string[]): boolean {
  return ruleIds.some((id) => id === "eksik-evrak" || /^[a-f\d]{24}$/i.test(id));
}

export async function runDocumentReminders(now = new Date(), openFiles?: OpenMailFile[]): Promise<number> {
  if (!env.mailEnabled) return 0;
  const files = withCustomer(openFiles ?? await loadOpenMailFiles());
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
    const [rules, documents, dispatches] = await Promise.all([
      CustomerDocumentRuleModel.find({
        companyId,
        customerId: { $in: customerIds },
        status: "Aktif"
      }).lean<CustomerDocumentRuleDoc[]>(),
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
    const ruleIdsByFile = new Map<string, string[]>();
    for (const row of dispatches) {
      const id = String(row.declarationId);
      const ids = ruleIdsByFile.get(id) ?? [];
      ids.push(row.ruleId);
      ruleIdsByFile.set(id, ids);
    }
    for (const file of group) {
      const operation = file.operation;
      const customerId = operation?.customerId;
      if (!operation || !customerId) continue;
      if (priorDocumentReminder(ruleIdsByFile.get(String(file._id)) ?? [])) continue;
      const uploaded = typesByFile.get(String(file._id)) ?? new Set<string>();
      const missing = [...new Set(rules.flatMap((rule) => {
        if (rule.customerId !== customerId) return [];
        if (!ruleCoversFile(rule, operation.operationType, operation.transportMode)) return [];
        return missingDocsFromRule(rule.requiredDocs, uploaded);
      }))];
      if (missing.length === 0) continue;

      const claimed = await DocumentReminderDispatchModel.updateOne(
        { declarationId: file._id, ruleId: "eksik-evrak", slotKey: FIRST_SLOT },
        { $setOnInsert: { companyId, declarationId: file._id, ruleId: "eksik-evrak", slotKey: FIRST_SLOT, sentAt: now } },
        { upsert: true }
      );
      if (claimed.upsertedCount !== 1) continue;

      try {
        const result = await sendDocumentReminder(companyId, {
          customerId,
          customerName: operation.customerName?.trim() || "Müşteri",
          reference: operation.ref?.trim() || String(file._id),
          missingDocuments: missing,
          mode: "automatic"
        });
        if (result.to.length === 0) {
          await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId: "eksik-evrak", slotKey: FIRST_SLOT });
          continue;
        }
        sent += 1;
      } catch (error) {
        await DocumentReminderDispatchModel.deleteOne({ declarationId: file._id, ruleId: "eksik-evrak", slotKey: FIRST_SLOT });
        console.error(JSON.stringify({
          event: "document-reminder.failed",
          ref: operation.ref,
          message: error instanceof Error ? error.message : "Hatırlatma gönderilemedi"
        }));
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
      if (!env.mailEnabled) return;
      const openFiles = await loadOpenMailFiles();
      const sent = await runDocumentReminders(new Date(), openFiles);
      const gtip = await runGtipIdleReminders(new Date(), openFiles);
      const stages = await runStageDigests(new Date(), openFiles);
      const summaries = await runCustomerSummaries(new Date(), openFiles);
      const cutoffs = await runCutoffAlerts(new Date(), openFiles);
      const writing = await runWritingReadyReminders(new Date(), openFiles);
      if (sent > 0 || gtip > 0 || stages > 0 || summaries > 0 || cutoffs > 0 || writing > 0) {
        console.log(JSON.stringify({ event: "document-reminder.sent", sent, gtip, stages, summaries, cutoffs, writing }));
      }
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
