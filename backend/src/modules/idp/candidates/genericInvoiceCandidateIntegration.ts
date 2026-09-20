import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { GenericInvoiceCandidateAudit } from "../domain/genericCandidateIntegration.types.js";
import { validateGenericInvoiceEvidence } from "../validator/genericInvoiceEvidenceValidator.js";
import { discoverGenericInvoiceFieldCandidates } from "./genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "./invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "./invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "./invoiceCommercialTermsCandidateDiscovery.js";
import { compareGenericAndLegacyInvoiceCandidates } from "./genericInvoiceCandidateMigration.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

/**
 * Run generic invoice discovery inside the production candidate-extraction
 * stage without promoting its values into the resolver yet.
 *
 * Keeping this boundary explicit is important: Foundation 5.1 proves the
 * generic path on normal uploads and persists its audit trail. Foundation 5.2
 * keeps legacy comparison as migration telemetry while canonical evidence
 * validation owns generic readiness. RESOLVE output is still unchanged here.
 */
export function buildGenericInvoiceCandidateAudit(
  canonicalDocument: CanonicalDocument,
  segmentId: string,
  legacyCandidates: FieldCandidateEnvelope
): GenericInvoiceCandidateAudit {
  const candidates = discoverGenericInvoiceFieldCandidates(canonicalDocument, segmentId);
  const shipmentCandidates = discoverInvoiceShipmentFieldCandidates(canonicalDocument, segmentId);
  const headerPartyCandidates = discoverInvoiceHeaderPartyFieldCandidates(canonicalDocument, segmentId);
  const commercialTermsCandidates = discoverInvoiceCommercialTermsFieldCandidates(canonicalDocument, segmentId);
  const validation = validateGenericInvoiceEvidence(canonicalDocument, candidates);
  const migration = compareGenericAndLegacyInvoiceCandidates(legacyCandidates, candidates, validation);

  return {
    version: "1",
    mode: "SHADOW",
    candidates,
    shipmentCandidates,
    headerPartyCandidates,
    commercialTermsCandidates,
    validation,
    migration
  };
}
