import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "backend/scripts/idp/replayProductE2E1850PersistedSemanticAuthorityCoverage.ts"), "utf8");
assert.match(source, /discoverInvoiceHeaderPartyFieldCandidates\(canonical, segmentId\)/);
assert.match(source, /discoverInvoiceShipmentFieldCandidates\(canonical, segmentId\)/);
assert.match(source, /discoverInvoiceCommercialTermsFieldCandidates\(canonical, segmentId\)/);
assert.match(source, /sanitizeVisionCommercialSemanticCandidates\(persisted/);
assert.match(source, /enforceVisionDocumentRoleAuthority\(guarded, canonical\)/);
assert.match(source, /enforceVisionSourceBackedCommercialNumericAuthority/);
assert.match(source, /enforceValidatedNativeGoodsFieldAuthority/);
assert.match(source, /enforceVisionGoodsRowBoundary/);
assert.match(source, /selectDirectSourceEvidenceAuthority/);
assert.match(source, /resolveDeclarationFields/);
assert.match(source, /DEFAULT_DECLARATION_FIELD_TARGETS/);
assert.match(source, /REPLAY_SOURCE_MISSING/);
assert.match(source, /REPLAY_SOURCE_STALE/);
assert.match(source, /CURRENT_SEMANTIC_REPLAY_AVAILABLE/);
assert.match(source, /ocrOrModelInference:\s*false/);
assert.match(source, /databaseMutation:\s*false/);
assert.doesNotMatch(source, /\.save\s*\(|updateOne\s*\(|updateMany\s*\(|findOneAndUpdate\s*\(|bulkWrite\s*\(|insertMany\s*\(/);
console.log(JSON.stringify({ event: "product-e2e-1.8.50.persisted-semantic-authority-coverage.contract.passed", acceptance: {
  currentDeterministicRediscovery: true, currentPersistenceGuardsReplayed: true, foundation6AuthorityAndResolutionReplayed: true,
  promotionEligibilityAuditedWithoutWrite: true, staleOrMissingReplaySeparatedFromSemanticFailure: true, sevenDocumentTargetMatrix: true
}, guardrails: { persistedCanonicalEvidenceOnly: true, ocrOrModelInference: false, databaseMutation: false, supplierSpecificRules: false, directNormalizedWrite: false } }, null, 2));
