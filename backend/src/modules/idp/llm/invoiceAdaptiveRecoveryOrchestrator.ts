import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import { INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION } from "./invoiceAdaptiveRecoverySkill.js";

export const InvoiceRecoveryTool = {
  SCALAR_EVIDENCE: "SCALAR_EVIDENCE",
  GOODS_TABLE_EVIDENCE: "GOODS_TABLE_EVIDENCE",
  LAYOUT_VISION_EVIDENCE: "LAYOUT_VISION_EVIDENCE",
  CROSS_PAGE_EVIDENCE: "CROSS_PAGE_EVIDENCE"
} as const;
export type InvoiceRecoveryToolValue = typeof InvoiceRecoveryTool[keyof typeof InvoiceRecoveryTool];

export interface InvoiceRecoveryAction {
  tool: InvoiceRecoveryToolValue;
  fields: string[];
  reason: "MISSING_CORE_FIELD" | "MISSING_GOODS_FIELD" | "CONFLICTING_EVIDENCE" | "INVALID_GTIN_SHAPE" | "IDENTITY_ROLE_COLLISION" | "NUMERIC_ROLE_COLLISION" | "GOODS_ARITHMETIC_DISAGREEMENT";
}

export interface InvoiceAdaptiveRecoveryPlan {
  version: "1";
  mode: "SHADOW";
  skillVersion: typeof INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION;
  actions: InvoiceRecoveryAction[];
  bounded: true;
  mutatesCandidates: false;
  writesNormalizedData: false;
  foundation6Authoritative: true;
}

const CORE_SCALARS = ["invoiceNo", "invoiceDate", "currency"] as const;
const valueKey = (value: unknown) => JSON.stringify(value);
const hasDateLikeFragment = (value: unknown): boolean => {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(text)
    || /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(text)
    || /\b\d{1,2}[- ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[- ]\d{2,4}\b/i.test(text);
};

const numeric = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

function distinctValues(candidates: FieldCandidate[] | undefined): number {
  return new Set((candidates ?? []).map((candidate) => valueKey(candidate.value))).size;
}

function addAction(actions: InvoiceRecoveryAction[], action: InvoiceRecoveryAction): void {
  const existing = actions.find((item) => item.tool === action.tool && item.reason === action.reason);
  if (!existing) {
    actions.push({ ...action, fields: [...new Set(action.fields)].sort() });
    return;
  }
  existing.fields = [...new Set([...existing.fields, ...action.fields])].sort();
}

/**
 * Foundation 7 shadow planner. It observes the already-produced evidence
 * envelope and proposes the smallest recovery tool family. It deliberately
 * does not execute tools or mutate candidates yet, so introducing the planner
 * cannot change extraction or Foundation 6 promotion behavior.
 */
export function planInvoiceAdaptiveRecovery(candidates: FieldCandidateEnvelope): InvoiceAdaptiveRecoveryPlan {
  const actions: InvoiceRecoveryAction[] = [];

  for (const field of CORE_SCALARS) {
    if ((candidates.fields[field] ?? []).length === 0) {
      addAction(actions, { tool: InvoiceRecoveryTool.SCALAR_EVIDENCE, fields: [field], reason: "MISSING_CORE_FIELD" });
    }
  }

  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (distinctValues(fieldCandidates) <= 1) continue;
    addAction(actions, {
      tool: field.startsWith("goodsLines.") ? InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE : InvoiceRecoveryTool.SCALAR_EVIDENCE,
      fields: [field],
      reason: "CONFLICTING_EVIDENCE"
    });
  }

  const invoiceNoCandidates = candidates.fields.invoiceNo ?? [];
  if (invoiceNoCandidates.some((candidate) => hasDateLikeFragment(candidate.value))) {
    addAction(actions, {
      tool: InvoiceRecoveryTool.SCALAR_EVIDENCE,
      fields: ["invoiceNo"],
      reason: "IDENTITY_ROLE_COLLISION"
    });
  }

  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (!/^goodsLines\.\d+\.hsCode$/.test(field)) continue;
    // Prefixes such as "GTIP:" are presentation, not an invalid code shape.
    // The recovery planner only cares whether the candidate contains exactly
    // twelve digits; Foundation 6 remains responsible for authoritative use.
    const hasAuthoritativeShape = fieldCandidates.some((candidate) => /^\d{12}$/.test(String(candidate.value ?? "").replace(/\D/g, "")));
    if (!hasAuthoritativeShape && fieldCandidates.length > 0) {
      addAction(actions, { tool: InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE, fields: [field], reason: "INVALID_GTIN_SHAPE" });
    }
  }

  const goodsQuantities = new Set<number>();
  for (const [field, fieldCandidates] of Object.entries(candidates.fields)) {
    if (!/^goodsLines\.\d+\.quantity$/.test(field)) continue;
    for (const candidate of fieldCandidates) {
      const n = numeric(candidate.value);
      if (n !== undefined) goodsQuantities.add(n);
    }
  }
  for (const field of ["grossWeight", "netWeight"] as const) {
    const collision = (candidates.fields[field] ?? []).some((candidate) => {
      const n = numeric(candidate.value);
      return n !== undefined && goodsQuantities.has(n);
    });
    if (collision) addAction(actions, { tool: InvoiceRecoveryTool.SCALAR_EVIDENCE, fields: [field], reason: "NUMERIC_ROLE_COLLISION" });
  }

  const indexes = new Set<number>();
  for (const field of Object.keys(candidates.fields)) {
    const match = field.match(/^goodsLines\.(\d+)\./);
    if (match) indexes.add(Number(match[1]));
  }
  for (const index of indexes) {
    if ((candidates.fields[`goodsLines.${index}.description`] ?? []).length === 0) {
      addAction(actions, {
        tool: InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE,
        fields: [`goodsLines.${index}.description`],
        reason: "MISSING_GOODS_FIELD"
      });
    }

    const q = numeric(candidates.fields[`goodsLines.${index}.quantity`]?.[0]?.value);
    const p = numeric(candidates.fields[`goodsLines.${index}.unitPrice`]?.[0]?.value);
    const t = numeric(candidates.fields[`goodsLines.${index}.lineTotal`]?.[0]?.value);
    if (q === undefined || p === undefined || t === undefined || t === 0) continue;
    const tolerance = Math.max(0.01, Math.abs(t) * 0.005);
    if (Math.abs(q * p - t) > tolerance) {
      addAction(actions, {
        tool: InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE,
        fields: [`goodsLines.${index}.quantity`, `goodsLines.${index}.unitPrice`, `goodsLines.${index}.lineTotal`],
        reason: "GOODS_ARITHMETIC_DISAGREEMENT"
      });
    }
  }

  return {
    version: "1",
    mode: "SHADOW",
    skillVersion: INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION,
    actions,
    bounded: true,
    mutatesCandidates: false,
    writesNormalizedData: false,
    foundation6Authoritative: true
  };
}
