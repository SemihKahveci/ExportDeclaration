import { getByPath } from "../../common/utils/getByPath.js";
import { mandatoryInvoiceTypes } from "../../common/enums/documentType.js";
import type { DocumentTypeValue } from "../../common/enums/documentType.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import { mvpValidationRules, type ValidationRule } from "./validation.rules.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function checkRule(rule: ValidationRule, data: NormalizedDeclaration): string | null {
  const value = getByPath(data, rule.path);

  if (rule.path === "goodsLines") {
    const arr = Array.isArray(value) ? value : data.goodsLines;
    if (rule.required && (!arr || arr.length === 0)) return rule.message;
    if (rule.minItems !== undefined && (!arr || arr.length < rule.minItems)) return rule.message;
    return null;
  }

  if (rule.required && (value === undefined || value === null || value === "")) {
    return rule.message;
  }
  return null;
}

export function validateNormalizedDeclaration(data: NormalizedDeclaration): ValidationResult {
  const errors: string[] = [];
  for (const rule of mvpValidationRules) {
    const err = checkRule(rule, data);
    if (err) errors.push(err);
  }
  return { ok: errors.length === 0, errors };
}

export function validateMandatoryInvoicePresent(documentTypes: DocumentTypeValue[]): string | null {
  const has = documentTypes.some((t) => mandatoryInvoiceTypes.includes(t));
  if (!has) {
    return "Zorunlu fatura yok: en az bir INVOICE veya E_INVOICE_XML belgesi yüklenmelidir (teknik doküman §4).";
  }
  return null;
}
