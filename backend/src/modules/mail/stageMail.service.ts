import mongoose from "mongoose";
import { CustomerModel } from "../customers/customer.models.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { AppUserModel } from "../users/user.model.js";
import { MailTemplateModel } from "../mail-templates/mailTemplate.model.js";
import { env } from "../../config/env.js";
import { DocumentReminderDispatchModel } from "./documentReminder.model.js";
import { dueReminderSlot } from "./documentReminderSchedule.js";
import { deliverProcessMail } from "./processMail.service.js";

type Stage = "beyanname-kontrol" | "tescil" | "kapanis";

type StaffUser = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  role?: string;
  operationTypes?: string[];
  status?: string;
};

const STAGE_STATUS: Record<Stage, string> = {
  "beyanname-kontrol": "ic-kontrol",
  tescil: "tescil",
  kapanis: "kapanis-bekleyen"
};

const STAGE_LABEL: Record<Stage, { subject: string; body: string; statusText: string }> = {
  "beyanname-kontrol": {
    subject: "Beyanname kontrol · {referans}",
    body: "Kontrolünüzde bekleyen dosyalar: {referans}.",
    statusText: "Kontrol bekliyor"
  },
  tescil: {
    subject: "Tescil · {referans}",
    body: "Tescil aşamasındaki dosyalar: {referans}.",
    statusText: "Tescil"
  },
  kapanis: {
    subject: "Kapanış · {referans}",
    body: "Kapanış aşamasındaki dosyalar: {referans}.",
    statusText: "Kapanış"
  }
};

function operationKey(value: string | null | undefined): string {
  const text = (value ?? "").trim().toLocaleLowerCase("tr-TR");
  if (text.startsWith("ihracat") || text === "export") return "ihracat";
  if (text.startsWith("ithalat") || text === "import") return "ithalat";
  if (text.startsWith("transit")) return "transit";
  if (text.startsWith("antrepo")) return "antrepo";
  return text;
}

function seesOperation(user: StaffUser, operationType: string | null | undefined, restricted: string[]): boolean {
  if (!restricted.includes(user.role ?? "")) return true;
  const key = operationKey(operationType);
  return (user.operationTypes ?? []).some((item) => operationKey(item) === key);
}

function emailOf(user: StaffUser | undefined): string | null {
  const email = user?.email?.trim().toLowerCase();
  return email || null;
}

async function staff(companyId: mongoose.Types.ObjectId): Promise<StaffUser[]> {
  return AppUserModel.find({ companyId, status: "Aktif" })
    .select({ email: 1, role: 1, operationTypes: 1, status: 1 })
    .lean<StaffUser[]>();
}

export async function stageRecipients(
  companyId: mongoose.Types.ObjectId,
  customerId: string,
  operationType: string | null | undefined,
  stage: Stage
): Promise<Array<{ userId: string; email: string }>> {
  const [users, customer] = await Promise.all([
    staff(companyId),
    CustomerModel.findOne({ _id: customerId, companyId }).select({ assignedMtUserId: 1, assignedMtManagerUserId: 1 }).lean<{ assignedMtUserId?: string; assignedMtManagerUserId?: string } | null>()
  ]);
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const chosen: StaffUser[] = [];
  const mt = byId.get(customer?.assignedMtUserId ?? "");
  if (mt) chosen.push(mt);
  if (stage !== "beyanname-kontrol") {
    const manager = byId.get(customer?.assignedMtManagerUserId ?? "");
    if (manager) chosen.push(manager);
    for (const user of users) {
      if (user.role === "Yönetici" && seesOperation(user, operationType, ["Yönetici"])) chosen.push(user);
    }
  }
  if (stage === "kapanis") {
    for (const user of users) {
      if ((user.role === "Saha" || user.role === "Operasyon") && seesOperation(user, operationType, ["Saha", "Operasyon"])) chosen.push(user);
      if (user.role === "Muhasebe") chosen.push(user);
    }
  }
  const unique = new Map<string, { userId: string; email: string }>();
  for (const user of chosen) {
    const email = emailOf(user);
    if (!email) continue;
    unique.set(String(user._id), { userId: String(user._id), email });
  }
  return [...unique.values()];
}

async function suppressOpenSlot(companyId: mongoose.Types.ObjectId, userId: string, stage: Stage, frequency: string, receivedAt: Date, now: Date): Promise<void> {
  const slot = dueReminderSlot({ frequency, receivedAt, cutoffAt: null, now, sent: new Set() });
  if (!slot) return;
  await DocumentReminderDispatchModel.updateOne(
    { declarationId: companyId, ruleId: `digest:${stage}:${userId}`, slotKey: slot },
    { $setOnInsert: { companyId, declarationId: companyId, ruleId: `digest:${stage}:${userId}`, slotKey: slot, sentAt: now } },
    { upsert: true }
  );
}

export async function notifyStageEntered(input: {
  companyId: mongoose.Types.ObjectId;
  customerId: string;
  operationType: string | null | undefined;
  reference: string;
  stage: Stage;
  receivedAt: Date;
}): Promise<void> {
  const people = await stageRecipients(input.companyId, input.customerId, input.operationType, input.stage);
  if (people.length === 0) return;
  const template = await MailTemplateModel.findOne({ companyId: input.companyId, processStep: input.stage, active: true }).sort({ updatedAt: -1 });
  const copy = STAGE_LABEL[input.stage];
  const now = new Date();
  await deliverProcessMail({
    companyId: input.companyId,
    processStep: input.stage,
    recipients: people.map((person) => person.email),
    values: {
      "{musteri}": "",
      "{referans}": input.reference,
      "{beyanname_no}": input.reference,
      "{eksik_evraklar}": "",
      "{gtip_sonuc}": "",
      "{tescil_no}": input.stage === "tescil" ? input.reference : "",
      "{kapanis_durumu}": input.stage === "kapanis" ? copy.statusText : "",
      "{tarih}": now.toLocaleDateString("tr-TR"),
      "{sorumlu}": ""
    },
    fallbackSubject: copy.subject,
    fallbackBody: copy.body
  });
  const frequency = template?.frequency?.trim() ?? "";
  if (!frequency || frequency === "Manuel takip") return;
  for (const person of people) {
    await suppressOpenSlot(input.companyId, person.userId, input.stage, frequency, input.receivedAt, now);
  }
}

export async function runStageDigests(now = new Date()): Promise<number> {
  if (!env.mailEnabled) return 0;
  const files = await DeclarationModel.find({
    "operation.isArchived": { $ne: true },
    "operation.fileStatus": { $in: Object.values(STAGE_STATUS) },
    "operation.customerId": { $nin: [null, ""] }
  }).select({ companyId: 1, operation: 1, updatedAt: 1 }).lean();
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
    const templates = await MailTemplateModel.find({
      companyId,
      processStep: { $in: ["beyanname-kontrol", "tescil", "kapanis"] },
      active: true,
      frequency: { $nin: ["", "Manuel takip"] }
    }).lean<Array<{ processStep?: Stage; frequency?: string }>>();
    for (const template of templates) {
      const stage = template.processStep;
      if (!stage || !STAGE_STATUS[stage]) continue;
      const frequency = template.frequency?.trim() ?? "";
      const pending = group.filter((file) => file.operation?.fileStatus === STAGE_STATUS[stage]);
      const buckets = new Map<string, { email: string; refs: string[]; since: Date }>();
      for (const file of pending) {
        const operation = file.operation;
        if (!operation?.customerId) continue;
        const people = await stageRecipients(companyId, operation.customerId, operation.operationType, stage);
        const since = file.updatedAt ? new Date(file.updatedAt) : new Date(operation.receivedAt ?? now);
        for (const person of people) {
          const bucket = buckets.get(person.userId) ?? { email: person.email, refs: [], since };
          bucket.refs.push(operation.ref);
          if (since.getTime() < bucket.since.getTime()) bucket.since = since;
          buckets.set(person.userId, bucket);
        }
      }
      for (const [userId, bucket] of buckets) {
        const ruleId = `digest:${stage}:${userId}`;
        const sentRows = await DocumentReminderDispatchModel.find({ declarationId: companyId, ruleId }).select({ slotKey: 1 }).lean();
        const slot = dueReminderSlot({
          frequency,
          receivedAt: bucket.since,
          cutoffAt: null,
          now,
          sent: new Set(sentRows.map((row) => row.slotKey))
        });
        if (!slot) continue;
        const claimed = await DocumentReminderDispatchModel.updateOne(
          { declarationId: companyId, ruleId, slotKey: slot },
          { $setOnInsert: { companyId, declarationId: companyId, ruleId, slotKey: slot, sentAt: now } },
          { upsert: true }
        );
        if (claimed.upsertedCount !== 1) continue;
        try {
          const copy = STAGE_LABEL[stage];
          const refs = [...new Set(bucket.refs)].join(", ");
          const count = await deliverProcessMail({
            companyId,
            processStep: stage,
            recipients: [bucket.email],
            values: {
              "{musteri}": "",
              "{referans}": refs,
              "{beyanname_no}": refs,
              "{eksik_evraklar}": "",
              "{gtip_sonuc}": "",
              "{tescil_no}": stage === "tescil" ? refs : "",
              "{kapanis_durumu}": stage === "kapanis" ? copy.statusText : "",
              "{tarih}": now.toLocaleDateString("tr-TR"),
              "{sorumlu}": ""
            },
            fallbackSubject: copy.subject,
            fallbackBody: copy.body
          });
          if (count === 0) {
            await DocumentReminderDispatchModel.deleteOne({ declarationId: companyId, ruleId, slotKey: slot });
            continue;
          }
          sent += 1;
        } catch (error) {
          await DocumentReminderDispatchModel.deleteOne({ declarationId: companyId, ruleId, slotKey: slot });
          console.error(JSON.stringify({
            event: "stage-digest.failed",
            stage,
            message: error instanceof Error ? error.message : "Aşama özeti gönderilemedi"
          }));
        }
      }
    }
  }
  return sent;
}
