import type { FieldCandidateEnvelope } from "./fieldCandidate.types.js";
import type { GenericEvidenceValidationResult } from "./genericEvidenceValidation.types.js";
import type { GenericInvoiceMigrationAudit } from "./genericCandidateMigration.types.js";

/**
 * Production-attached generic discovery payload.
 *
 * This is intentionally separate from `fieldCandidates`: Foundation 5.1 runs
 * generic discovery in the real candidate registry and persists its evidence
 * validation, but does not yet allow it to change RESOLVE output. Promotion is
 * a separate migration decision so legacy behaviour cannot change silently.
 */
export interface GenericInvoiceCandidateAudit {
  version: "1";
  mode: "SHADOW";
  candidates: FieldCandidateEnvelope;
  shipmentCandidates?: FieldCandidateEnvelope;
  headerPartyCandidates?: FieldCandidateEnvelope;
  commercialTermsCandidates?: FieldCandidateEnvelope;
  originCandidates?: FieldCandidateEnvelope;
  validation: GenericEvidenceValidationResult;
  migration: GenericInvoiceMigrationAudit;
}
