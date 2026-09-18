import assert from "node:assert/strict";
import type { FieldCandidate, FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { GenericEvidenceValidationStatus } from "../../src/modules/idp/domain/genericEvidenceValidation.types.js";
import type { GenericEvidenceValidationResult } from "../../src/modules/idp/domain/genericEvidenceValidation.types.js";
import { compareGenericAndLegacyInvoiceCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateMigration.js";

function candidate(id: string, field: string, value: unknown): FieldCandidate {
  return { candidateId: id, field, value, confidence: 0.9, extractor: "test", evidence: [] };
}
function envelope(fields: Record<string, FieldCandidate[]>): FieldCandidateEnvelope {
  return { version: "1", fields };
}
function validation(status: "VALID" | "REVIEW_REQUIRED" = "VALID"): GenericEvidenceValidationResult {
  const valid = status === GenericEvidenceValidationStatus.VALID;
  return {
    version: "1",
    status,
    rows: [{ rowIndex: 0, status, issues: [] }],
    summary: {
      rowCount: 1,
      validRowCount: valid ? 1 : 0,
      reviewRequiredRowCount: valid ? 0 : 1,
      issueCount: valid ? 0 : 1,
      reasonCounts: valid ? {} : { MISSING_REQUIRED_FIELD: 1 }
    }
  };
}
const validEvidence = validation();

const legacy = envelope({
  "goodsLines.0.hsCode": [candidate("l-hs", "goodsLines.0.hsCode", "853620900019")],
  "goodsLines.0.productCode": [candidate("l-p", "goodsLines.0.productCode", "216384")],
  "goodsLines.0.quantity": [candidate("l-q", "goodsLines.0.quantity", 15)]
});
const generic = envelope({
  "goodsLines.0.hsCode": [candidate("g-hs", "goodsLines.0.hsCode", "853620900019")],
  "goodsLines.0.productCode": [candidate("g-p", "goodsLines.0.productCode", "AG.EAT.216384")],
  "goodsLines.0.quantity": [candidate("g-q", "goodsLines.0.quantity", 16)]
});

const result = compareGenericAndLegacyInvoiceCandidates(legacy, generic, validEvidence);
assert.equal(result.fields["goodsLines.0.hsCode"]?.status, "AGREE");
assert.equal(result.fields["goodsLines.0.productCode"]?.status, "EQUIVALENT");
assert.equal(result.fields["goodsLines.0.quantity"]?.status, "CONFLICT");
// Legacy is migration telemetry, not ground truth. Canonical evidence owns readiness.
assert.equal(result.promotable, true);
assert.equal(result.promotion.status, "READY");
assert.equal(result.summary.agreeCount, 1);
assert.equal(result.summary.equivalentCount, 1);
assert.equal(result.summary.conflictCount, 1);

const noConflict = compareGenericAndLegacyInvoiceCandidates(
  legacy,
  envelope({
    "goodsLines.0.hsCode": [candidate("g2-hs", "goodsLines.0.hsCode", "853620900019")],
    "goodsLines.0.productCode": [candidate("g2-p", "goodsLines.0.productCode", "EAT.216384")],
    "goodsLines.0.quantity": [candidate("g2-q", "goodsLines.0.quantity", 15)]
  }),
  validEvidence
);
assert.equal(noConflict.promotable, true);

console.log(JSON.stringify({ event: "idp.generic-invoice-migration.regression.passed", conflictCase: result.summary, promotableCase: noConflict.summary }, null, 2));

const descriptionLegacy = envelope({
  "goodsLines.0.productCode": [candidate("dl-p", "goodsLines.0.productCode", "A9F75440")],
  "goodsLines.0.description": [candidate("dl-d", "goodsLines.0.description", "AG.SCH.A9F75440 İC60N 4×40 A D 6kA OTOMATİK SİGORTA")]
});
const descriptionGeneric = envelope({
  "goodsLines.0.productCode": [
    candidate("dg-p1", "goodsLines.0.productCode", "AG.SCH.A9F75440"),
    candidate("dg-p2", "goodsLines.0.productCode", "A9F75440")
  ],
  "goodsLines.0.description": [candidate("dg-d", "goodsLines.0.description", "A9F75440 İC60N 4×40 A D 6kA OTOMATİK SİGORTA")]
});
const descriptionEquivalent = compareGenericAndLegacyInvoiceCandidates(descriptionLegacy, descriptionGeneric, validEvidence);
assert.equal(descriptionEquivalent.fields["goodsLines.0.description"]?.status, "EQUIVALENT");
assert.equal(descriptionEquivalent.promotable, true);

const materiallyDifferentDescription = compareGenericAndLegacyInvoiceCandidates(
  descriptionLegacy,
  envelope({
    "goodsLines.0.productCode": [candidate("dg2-p", "goodsLines.0.productCode", "A9F75440")],
    "goodsLines.0.description": [candidate("dg2-d", "goodsLines.0.description", "NSX250B 250A")]
  }),
  validEvidence
);
assert.equal(materiallyDifferentDescription.fields["goodsLines.0.description"]?.status, "CONFLICT");
assert.equal(materiallyDifferentDescription.promotable, true);

const missingRequiredGenericField = compareGenericAndLegacyInvoiceCandidates(
  envelope({ "goodsLines.0.productCode": [candidate("ml-p", "goodsLines.0.productCode", "C10H3")] }),
  envelope({}),
  validation("REVIEW_REQUIRED")
);
assert.equal(missingRequiredGenericField.fields["goodsLines.0.productCode"]?.status, "LEGACY_ONLY");
assert.equal(missingRequiredGenericField.promotable, false);
assert.equal(missingRequiredGenericField.promotion.status, "REVIEW_REQUIRED");
assert.deepEqual(missingRequiredGenericField.promotion.reasons, ["GENERIC_EVIDENCE_REVIEW_REQUIRED"]);

const emptyGeneric = compareGenericAndLegacyInvoiceCandidates(envelope({}), envelope({}), {
  version: "1",
  status: GenericEvidenceValidationStatus.VALID,
  rows: [],
  summary: { rowCount: 0, validRowCount: 0, reviewRequiredRowCount: 0, issueCount: 0, reasonCounts: {} }
});
assert.equal(emptyGeneric.promotable, false);
assert.deepEqual(emptyGeneric.promotion.reasons, ["NO_GENERIC_GOODS_ROWS"]);

console.log(JSON.stringify({
  event: "idp.generic-invoice-migration.hardening-regression.passed",
  descriptionEquivalent: descriptionEquivalent.summary,
  materiallyDifferentDescription: materiallyDifferentDescription.summary,
  missingRequiredGenericField: missingRequiredGenericField.summary,
  promotionPolicy: result.policy
}, null, 2));
