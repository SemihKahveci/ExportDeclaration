import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function main() {
  const [service, adapter] = await Promise.all([
    fs.readFile("backend/src/modules/declarations/declaration.service.ts", "utf8"),
    fs.readFile("frontend/src/api/adapters/declarationAdapter.ts", "utf8"),
  ]);

  assert.match(service, /const shipmentFields = discoverInvoiceShipmentFieldCandidates\(/,
    "Shipment/package fields must be refreshed from persisted canonical evidence during normalization.");
  assert.doesNotMatch(service, /audit\.shipmentCandidates\s*\?\?\s*discoverInvoiceShipmentFieldCandidates/,
    "A stale/missing persisted shipment envelope must not shadow current deterministic discovery.");

  assert.match(service, /const headerPartyFields = discoverInvoiceHeaderPartyFieldCandidates\(/,
    "Header/party fields must be refreshed from persisted canonical evidence during normalization.");
  assert.doesNotMatch(service, /audit\.headerPartyCandidates\s*\?\?\s*discoverInvoiceHeaderPartyFieldCandidates/,
    "A stale/missing persisted header/party envelope must not shadow current deterministic discovery.");

  assert.match(service, /run\.canonicalDocument as any/,
    "Deterministic refresh must use persisted canonical evidence rather than rerunning OCR/LLM.");

  assert.match(adapter, /"Taşıma Şekli": norm\.transport\.mode \?\? ""/,
    "Writing UI transport must come only from normalized document evidence.");
  assert.doesNotMatch(adapter, /"Taşıma Şekli":\s*norm\.transport\.mode\s*\?\?\s*op\?\.transportMode/,
    "Operation metadata must not backfill the document-owned writing transport field.");

  console.log(JSON.stringify({
    event: "product-e2e-1.8.13.deterministic-refresh-writing-authority.contract.passed",
    rootCausesClosed: [
      "stale persisted headerPartyCandidates can hide current sender/buyer discovery on Tekrar Yaz",
      "stale persisted shipmentCandidates can hide current package/weight discovery on Tekrar Yaz",
      "operation transport metadata can appear as invoice-derived writing data when document evidence is absent",
    ],
    guardrails: {
      refreshesHeaderPartyFromPersistedCanonicalDocument: true,
      refreshesShipmentFromPersistedCanonicalDocument: true,
      rerunsOcr: false,
      rerunsLlm: false,
      writingTransportRequiresNormalizedDocumentEvidence: true,
      supplierSpecificRules: false,
      directNormalizedConstantWrite: false,
    },
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
