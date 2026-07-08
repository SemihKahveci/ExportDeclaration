import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import {
  DECLARATION_TYPES,
  DeclarationApprovalRulesModel
} from "./declarationApprovalRules.model.js";
import {
  defaultDeclarationApprovalRulesDto,
  toDeclarationApprovalRulesDto,
  type DeclarationApprovalRulesDto
} from "./declarationApprovalRules.mapper.js";

function assertLevel(v: unknown, field: string): 1 | 2 {
  const n = typeof v === "number" ? v : Number(v);
  if (n === 1 || n === 2) return n;
  throw new HttpError(400, `Geçersiz onay seviyesi (${field}): ${String(v)}`);
}

function normalizeRules(body: Record<string, unknown>): DeclarationApprovalRulesDto {
  const result = {} as DeclarationApprovalRulesDto;
  for (const key of DECLARATION_TYPES) {
    result[key] = assertLevel(body[key], key);
  }
  return result;
}

export async function getDeclarationApprovalRules(
  companyId: mongoose.Types.ObjectId
): Promise<DeclarationApprovalRulesDto> {
  const doc = await DeclarationApprovalRulesModel.findOne({ companyId });
  if (!doc) return defaultDeclarationApprovalRulesDto();
  return toDeclarationApprovalRulesDto(doc);
}

export async function upsertDeclarationApprovalRules(
  companyId: mongoose.Types.ObjectId,
  body: Record<string, unknown>
): Promise<DeclarationApprovalRulesDto> {
  const rules = normalizeRules(body);
  const doc = await DeclarationApprovalRulesModel.findOneAndUpdate(
    { companyId },
    { $set: rules },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return toDeclarationApprovalRulesDto(doc);
}
