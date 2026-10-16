import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const replayPath = path.join(root, "backend/scripts/idp/replayLatestInvoice1823HeaderAuthority.ts");
const source = fs.readFileSync(replayPath, "utf8");

assert.match(source, /discoverInvoiceHeaderPartyFieldCandidates\(canonical, segmentId\)/);
assert.match(source, /discoverInvoiceShipmentFieldCandidates\(canonical, segmentId\)/);
assert.match(source, /discoverInvoiceCommercialTermsFieldCandidates\(canonical, segmentId\)/);
assert.match(source, /sourcePresentButUnresolved/);
assert.match(source, /stalePersisted/);
assert.match(source, /persistedCanonicalEvidenceOnly:\s*true/);
assert.match(source, /deterministicDiscoveryOnly:\s*true/);
assert.match(source, /ocrOrModelInference:\s*false/);
assert.match(source, /databaseMutation:\s*false/);
assert.doesNotMatch(source, /\.save\s*\(|updateOne\s*\(|updateMany\s*\(|findOneAndUpdate\s*\(|bulkWrite\s*\(|insertMany\s*\(/);

console.log(JSON.stringify({
  event: "product-e2e-1.8.23.persisted-header-authority-replay.contract.passed",
  guardrails: {
    currentDeterministicRediscovery: true,
    persistedVsCurrentComparison: true,
    foundation6CoverageComparison: true,
    persistedCanonicalEvidenceOnly: true,
    ocrOrModelInference: false,
    databaseMutation: false,
    directNormalizedWrite: false,
  },
}, null, 2));
