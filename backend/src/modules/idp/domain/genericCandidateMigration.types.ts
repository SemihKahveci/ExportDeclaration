export const GenericMigrationFieldStatus = {
  AGREE: "AGREE",
  EQUIVALENT: "EQUIVALENT",
  GENERIC_ONLY: "GENERIC_ONLY",
  LEGACY_ONLY: "LEGACY_ONLY",
  CONFLICT: "CONFLICT"
} as const;

export type GenericMigrationFieldStatusValue =
  (typeof GenericMigrationFieldStatus)[keyof typeof GenericMigrationFieldStatus];

export interface GenericMigrationFieldComparison {
  field: string;
  status: GenericMigrationFieldStatusValue;
  legacyCandidateIds: string[];
  genericCandidateIds: string[];
  legacyValues: unknown[];
  genericValues: unknown[];
}

export interface GenericInvoiceMigrationAudit {
  version: "1";
  policy: "SHADOW_COMPARE";
  promotable: boolean;
  fields: Record<string, GenericMigrationFieldComparison>;
  summary: {
    fieldCount: number;
    agreeCount: number;
    equivalentCount: number;
    genericOnlyCount: number;
    legacyOnlyCount: number;
    conflictCount: number;
  };
}
