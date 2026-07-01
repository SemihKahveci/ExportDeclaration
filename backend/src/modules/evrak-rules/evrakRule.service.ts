import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  EVRAK_CONDITION_FIELDS,
  EVRAK_CONDITION_OPERATORS,
  EvrakRuleModel,
  type EvrakRuleCondition
} from "./evrakRule.model.js";
import {
  calcStatsFromRules,
  toEvrakRuleDto,
  type EvrakRuleDto,
  type EvrakRulePageStatsDto
} from "./evrakRule.mapper.js";

export type CreateEvrakRuleInput = Omit<EvrakRuleDto, "id" | "createdAt">;
export type UpdateEvrakRuleInput = Partial<CreateEvrakRuleInput>;

function assertConditions(conditions: unknown): EvrakRuleCondition[] {
  if (!Array.isArray(conditions)) {
    throw new HttpError(400, "Koşullar dizi olmalıdır.");
  }

  return conditions.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw new HttpError(400, `Geçersiz koşul (satır ${index + 1}).`);
    }
    const item = raw as Record<string, unknown>;
    const field = item.field;
    const operator = item.operator;

    if (
      typeof field !== "string" ||
      !EVRAK_CONDITION_FIELDS.includes(field as (typeof EVRAK_CONDITION_FIELDS)[number])
    ) {
      throw new HttpError(400, `Geçersiz koşul alanı: ${String(field)}`);
    }
    if (
      typeof operator !== "string" ||
      !EVRAK_CONDITION_OPERATORS.includes(operator as (typeof EVRAK_CONDITION_OPERATORS)[number])
    ) {
      throw new HttpError(400, `Geçersiz koşul operatörü: ${String(operator)}`);
    }

    return {
      field: field as EvrakRuleCondition["field"],
      operator: operator as EvrakRuleCondition["operator"],
      value: typeof item.value === "string" ? item.value.trim() : String(item.value ?? "").trim(),
      enabled: Boolean(item.enabled)
    };
  });
}

function assertRequiredDocuments(docs: unknown): string[] {
  if (!Array.isArray(docs)) {
    throw new HttpError(400, "İstenen belgeler dizi olmalıdır.");
  }
  const cleaned = docs
    .map((d) => (typeof d === "string" ? d.trim() : String(d).trim()))
    .filter((d) => d.length > 0);
  if (cleaned.length === 0) {
    throw new HttpError(400, "En az bir belge seçilmelidir.");
  }
  return cleaned;
}

function validateRulePayload(name: unknown, conditions: EvrakRuleCondition[], requiredDocuments: string[]) {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) throw new HttpError(400, "Kural adı gerekli.");

  const activeConditions = conditions.filter((c) => c.enabled && c.value !== "");
  if (activeConditions.length < 2) {
    throw new HttpError(400, "En az 2 etkin koşul gerekli.");
  }

  if (requiredDocuments.length < 1) {
    throw new HttpError(400, "En az bir belge seçilmelidir.");
  }

  return trimmedName;
}

export async function listEvrakRules(companyId: mongoose.Types.ObjectId): Promise<EvrakRuleDto[]> {
  const rows = await EvrakRuleModel.find({ companyId }).sort({ createdAt: -1 });
  return rows.map(toEvrakRuleDto);
}

export async function getEvrakRuleStats(companyId: mongoose.Types.ObjectId): Promise<EvrakRulePageStatsDto> {
  const rules = await listEvrakRules(companyId);
  return calcStatsFromRules(rules);
}

export async function createEvrakRule(
  companyId: mongoose.Types.ObjectId,
  body: CreateEvrakRuleInput
): Promise<EvrakRuleDto> {
  const conditions = assertConditions(body.conditions);
  const requiredDocuments = assertRequiredDocuments(body.requiredDocuments);
  const name = validateRulePayload(body.name, conditions, requiredDocuments);

  const created = await EvrakRuleModel.create({
    companyId,
    name,
    conditions,
    requiredDocuments,
    active: body.active !== false
  });
  return toEvrakRuleDto(created);
}

export async function updateEvrakRule(
  companyId: mongoose.Types.ObjectId,
  id: string,
  body: UpdateEvrakRuleInput
): Promise<EvrakRuleDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");

  const existing = await EvrakRuleModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Kural bulunamadı.");

  const conditions = body.conditions !== undefined ? assertConditions(body.conditions) : existing.conditions;
  const requiredDocuments =
    body.requiredDocuments !== undefined
      ? assertRequiredDocuments(body.requiredDocuments)
      : existing.requiredDocuments;
  const name =
    body.name !== undefined
      ? validateRulePayload(body.name, conditions, requiredDocuments)
      : existing.name;

  if (body.name === undefined && body.conditions !== undefined) {
    validateRulePayload(name, conditions, requiredDocuments);
  }

  existing.name = name;
  existing.conditions = conditions;
  existing.requiredDocuments = requiredDocuments;
  if (body.active !== undefined) existing.active = Boolean(body.active);

  await existing.save();
  return toEvrakRuleDto(existing);
}

export async function toggleEvrakRuleActive(
  companyId: mongoose.Types.ObjectId,
  id: string
): Promise<EvrakRuleDto> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");

  const existing = await EvrakRuleModel.findOne({ _id: id, companyId });
  if (!existing) throw new HttpError(404, "Kural bulunamadı.");

  existing.active = !existing.active;
  await existing.save();
  return toEvrakRuleDto(existing);
}

export async function deleteEvrakRule(companyId: mongoose.Types.ObjectId, id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Geçersiz kural id.");
  const deleted = await EvrakRuleModel.findOneAndDelete({ _id: id, companyId });
  if (!deleted) throw new HttpError(404, "Kural bulunamadı.");
}
