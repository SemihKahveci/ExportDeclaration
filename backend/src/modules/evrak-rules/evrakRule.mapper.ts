import type { EvrakRuleDoc } from "./evrakRule.model.js";

export interface EvrakRuleDto {
  id: string;
  name: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: string;
    enabled: boolean;
  }>;
  requiredDocuments: string[];
  active: boolean;
  createdAt: string;
}

export interface EvrakRulePageStatsDto {
  total: number;
  active: number;
  passive: number;
  docTypes: number;
}

export function toEvrakRuleDto(doc: EvrakRuleDoc): EvrakRuleDto {
  return {
    id: String(doc._id),
    name: doc.name,
    conditions: (doc.conditions ?? []).map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.value ?? "",
      enabled: Boolean(c.enabled)
    })),
    requiredDocuments: doc.requiredDocuments ?? [],
    active: doc.active,
    createdAt: doc.createdAt.toISOString()
  };
}

export function calcStatsFromRules(rules: EvrakRuleDto[]): EvrakRulePageStatsDto {
  const active = rules.filter((r) => r.active).length;
  const allDocs = new Set(rules.flatMap((r) => r.requiredDocuments));
  return {
    total: rules.length,
    active,
    passive: rules.length - active,
    docTypes: allDocs.size
  };
}
