import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  MAIL_PROCESS_STEPS,
  MailTemplateModel,
  type MailTemplateDoc
} from "./mailTemplate.model.js";
import { toMailTemplateDto, type MailTemplateDto } from "./mailTemplate.mapper.js";

export type CreateMailTemplateInput = Omit<MailTemplateDto, "id">;
export type UpdateMailTemplateInput = Partial<CreateMailTemplateInput>;

function assertProcessStep(v: unknown): MailTemplateDoc["processStep"] {
  if (
    typeof v !== "string" ||
    !MAIL_PROCESS_STEPS.includes(v as (typeof MAIL_PROCESS_STEPS)[number])
  ) {
    throw new HttpError(400, `Geçersiz süreç: ${String(v)}`);
  }
  return v as MailTemplateDoc["processStep"];
}

function assertVariables(vars: unknown): string[] {
  if (!Array.isArray(vars)) return [];
  return vars.map((v) => (typeof v === "string" ? v.trim() : String(v))).filter(Boolean);
}

function validatePayload(body: {
  name?: unknown;
  processStep?: unknown;
  subject?: unknown;
  body?: unknown;
  variables?: unknown;
  frequency?: unknown;
  active?: unknown;
}): {
  name: string;
  processStep: MailTemplateDoc["processStep"];
  subject: string;
  body: string;
  variables: string[];
  frequency: string;
  active: boolean;
} {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new HttpError(400, "Şablon adı gerekli.");

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  if (!subject) throw new HttpError(400, "Mail konusu gerekli.");

  return {
    name,
    processStep: assertProcessStep(body.processStep),
    subject,
    body: typeof body.body === "string" ? body.body : "",
    variables: assertVariables(body.variables),
    frequency: typeof body.frequency === "string" ? body.frequency.trim() : "",
    active: body.active !== false
  };
}

const BUILTIN_TEMPLATES: Array<{
  processStep: MailTemplateDoc["processStep"];
  name: string;
  subject: string;
  body: string;
  variables: string[];
}> = [
  {
    processStep: "ozet-hatirlatma",
    name: "Özet Hatırlatma",
    subject: "Özet hatırlatma · {tarih}",
    body: "Sayın {musteri},\n\nSizden beklenen dosyalar:\n\n{ozet_tablo}\n\nİyi çalışmalar.",
    variables: ["{musteri}", "{tarih}", "{referans}", "{ozet_tablo}"]
  },
  {
    processStep: "cutoff-uyarisi",
    name: "Cut-off Uyarısı",
    subject: "Cut-off uyarısı · {referans}",
    body: "Sayın {musteri},\n\n{referans} dosyasında cut-off yaklaşıyor.\n\n{cutoff}\n\n{ozet_tablo}\n\nİyi çalışmalar.",
    variables: ["{musteri}", "{tarih}", "{referans}", "{cutoff}", "{ozet_tablo}"]
  }
];

function duplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
}

async function ensureBuiltinTemplates(companyId: mongoose.Types.ObjectId, present: Set<string>): Promise<boolean> {
  let added = false;
  for (const item of BUILTIN_TEMPLATES) {
    if (present.has(item.processStep)) continue;
    try {
      const written = await MailTemplateModel.updateOne(
        { companyId, processStep: item.processStep },
        {
          $setOnInsert: {
            companyId,
            name: item.name,
            processStep: item.processStep,
            subject: item.subject,
            body: item.body,
            variables: item.variables,
            frequency: "",
            active: true
          }
        },
        { upsert: true }
      );
      added = added || written.upsertedCount === 1;
    } catch (error) {
      if (!duplicateKey(error)) throw error;
    }
  }
  return added;
}

export async function listMailTemplates(companyId: mongoose.Types.ObjectId): Promise<MailTemplateDto[]> {
  const rows = await MailTemplateModel.find({ companyId }).sort({ createdAt: -1 });
  const added = await ensureBuiltinTemplates(companyId, new Set(rows.map((row) => row.processStep)));
  if (!added) return rows.map(toMailTemplateDto);
  const refreshed = await MailTemplateModel.find({ companyId }).sort({ createdAt: -1 });
  return refreshed.map(toMailTemplateDto);
}

export async function createMailTemplate(
  companyId: mongoose.Types.ObjectId,
  body: CreateMailTemplateInput
): Promise<MailTemplateDto> {
  const payload = validatePayload(body);
  const created = await MailTemplateModel.create({ companyId, ...payload });
  return toMailTemplateDto(created);
}

export async function updateMailTemplate(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: UpdateMailTemplateInput
): Promise<MailTemplateDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz şablon id.");

  const existing = await MailTemplateModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Mail şablonu bulunamadı.");

  const merged = {
    name: body.name ?? existing.name,
    processStep: body.processStep ?? existing.processStep,
    subject: body.subject ?? existing.subject,
    body: body.body ?? existing.body,
    variables: body.variables ?? existing.variables,
    frequency: body.frequency ?? existing.frequency,
    active: body.active ?? existing.active
  };
  const payload = validatePayload(merged);

  existing.name = payload.name;
  existing.processStep = payload.processStep;
  existing.subject = payload.subject;
  existing.body = payload.body;
  existing.variables = payload.variables;
  existing.frequency = payload.frequency;
  existing.active = payload.active;

  await existing.save();
  return toMailTemplateDto(existing);
}

export async function deleteMailTemplate(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz şablon id.");
  const deleted = await MailTemplateModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Mail şablonu bulunamadı.");
}
