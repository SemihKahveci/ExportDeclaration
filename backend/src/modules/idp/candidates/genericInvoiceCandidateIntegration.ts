import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { GenericInvoiceCandidateAudit } from "../domain/genericCandidateIntegration.types.js";
import { validateGenericInvoiceEvidence } from "../validator/genericInvoiceEvidenceValidator.js";
import { discoverGenericInvoiceFieldCandidates } from "./genericInvoiceCandidateDiscovery.js";
import { compareGenericAndLegacyInvoiceCandidates } from "./genericInvoiceCandidateMigration.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

/**
 * Run generic invoice discovery inside the production candidate-extraction
 * stage without promoting its values into the resolver yet.
 *
 * Keeping this boundary explicit is important: Foundation 5.1 proves the
 * generic path on normal uploads and persists its audit trail. Foundation 5.2
 * can then define conflict/promotion policy without a hidden behaviour change.
 */
export function buildGenericInvoiceCandidateAudit(
  canonicalDocument: CanonicalDocument,
  segmentId: string,
  legacyCandidates: FieldCandidateEnvelope
): GenericInvoiceCandidateAudit {
  const candidates = discoverGenericInvoiceFieldCandidates(canonicalDocument, segmentId);
  const validation = validateGenericInvoiceEvidence(canonicalDocument, candidates);
  const migration = compareGenericAndLegacyInvoiceCandidates(legacyCandidates, candidates, validation);

  return {
    version: "1",
    mode: "SHADOW",
    candidates,
    validation,
    migration
  };
}
