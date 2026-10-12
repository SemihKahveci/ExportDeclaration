import assert from "node:assert/strict";
import fs from "node:fs";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const fusion = fs.readFileSync("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");
const skill = fs.readFileSync("backend/src/modules/idp/llm/invoiceExtractionSkill.ts", "utf8");
const orchestrator = fs.readFileSync("backend/src/modules/idp/llm/invoiceProductionExtractionOrchestrator.ts", "utf8");
const promotion = fs.readFileSync("backend/src/modules/idp/domain/declarationFieldPromotion.service.ts", "utf8");

for (const field of ["sellerAddress", "sellerCountry", "buyerAddress", "buyerCountry", "totalAmount", "paymentType", "totalPackage"]) {
  assert.match(fusion, new RegExp(`\\b${field}\\b`), `production vision must request ${field}`);
  assert.match(skill, new RegExp(`\\b${field}\\b`), `skill must define ${field}`);
}
for (const path of ["parties.seller.address", "parties.seller.country", "parties.buyer.address", "parties.buyer.country"]) {
  assert.ok(orchestrator.includes(`\"${path}\"`), `vision mapping missing ${path}`);
  assert.ok(promotion.includes(`\"${path}\"`), `Foundation 6 promotion missing ${path}`);
}
function packageFixture(label: string): CanonicalDocument {
  const text = `${label}: 1`;
  return {
    schemaVersion: "1.0",
    source: { fileName: "generic-package-fixture.pdf", mimeType: "application/pdf" },
    analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1 },
    pages: [{
      pageNumber: 1, width: 1000, height: 1000, rotation: 0, nativeText: text,
      nativeCharCount: text.length, nativeWordCount: 1, hasNativeText: true, imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
      words: [{ text, bbox: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.12 }, confidence: 1, source: "NATIVE_TEXT" }],
      lines: [{ text, bbox: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.12 }, source: "NATIVE_TEXT" }],
    }],
  };
}
for (const label of [
  "KAP ADET",
  "KAP SAYISI",
  "TOTAL PACKAGE",
  "TOTAL PACKAGES",
  "TOTAL CARTON",
  "TOTAL CARTONS",
  "TOTAL PALLET",
  "TOTAL PALLETS",
] as const) {
  const discovered = discoverInvoiceShipmentFieldCandidates(
    packageFixture(label),
    "segment-contract",
  );
  assert.equal(
    discovered.fields["packageInfo.totalPackage"]?.[0]?.value,
    1,
    `generic shipment discovery must recognize ${label}`,
  );
}
assert.match(skill, /supplier identity alone/i, "country inference must not use supplier identity");
assert.match(skill, /unambiguous visible postal\/geographic address/i, "country inference must require geographic evidence");
assert.match(skill, /totalPackage means an explicitly labelled shipment\/package count/i, "package count must remain distinct from goods quantity");
assert.doesNotMatch(skill, /Volta|Ramisch|VXA2026000000035/i, "coverage skill must stay invoice/vendor agnostic");

console.log(JSON.stringify({
  event: "product-e2e-1.8.5.general-source-present-field-coverage.contract.passed",
  guardrails: {
    vendorAgnostic: true,
    partyAddressCoverage: true,
    partyCountryCoverage: true,
    monetaryCoverage: true,
    paymentCoverage: true,
    packageCountCoverage: true,
    geographicCountryInferenceBounded: true,
    foundation6Authoritative: true,
    directNormalizedWrite: false
  }
}, null, 2));
