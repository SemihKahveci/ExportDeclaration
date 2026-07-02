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
  active?: unknown;
}): {
  name: string;
  processStep: MailTemplateDoc["processStep"];
  subject: string;
  body: string;
  variables: string[];
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
    active: body.active !== false
  };
}

export async function listMailTemplates(companyId: mongoose.Types.ObjectId): Promise<MailTemplateDto[]> {
  const rows = await MailTemplateModel.find({ companyId }).sort({ createdAt: -1 });
  return rows.map(toMailTemplateDto);
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
    active: body.active ?? existing.active
  };
  const payload = validatePayload(merged);

  existing.name = payload.name;
  existing.processStep = payload.processStep;
  existing.subject = payload.subject;
  existing.body = payload.body;
  existing.variables = payload.variables;
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
