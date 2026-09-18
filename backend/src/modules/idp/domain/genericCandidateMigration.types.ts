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
  version: "2";
  policy: "CANONICAL_EVIDENCE_GATE_WITH_LEGACY_AUDIT";
  /**
   * Readiness of the generic candidate set itself. Legacy disagreement is
   * retained below as migration telemetry, but is not an authority over a
   * canonical-evidence-validated result.
   */
  promotable: boolean;
  promotion: {
    authority: "GENERIC_CANONICAL_EVIDENCE";
    status: "READY" | "REVIEW_REQUIRED";
    reasons: string[];
  };
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
