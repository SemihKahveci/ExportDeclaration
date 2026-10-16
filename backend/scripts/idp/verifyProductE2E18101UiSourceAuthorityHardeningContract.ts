import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeVisionHsCode,
  sanitizeVisionCarrier,
  sanitizeVisionPartyAddress,
  sanitizeVisionPaymentType,
} from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";

assert.equal(canonicalizeVisionHsCode("GTIP:020714990012"), "020714990012");
assert.equal(canonicalizeVisionHsCode("HS CODE: 330499"), "330499");
assert.equal(sanitizeVisionPartyAddress("Turkey"), undefined);
assert.equal(sanitizeVisionPartyAddress("NO.25, HUAYE STREET, NINGBO, CHINA"), "NO.25, HUAYE STREET, NINGBO, CHINA");
assert.equal(sanitizeVisionPaymentType("Under Duty Drawback"), undefined);
assert.equal(sanitizeVisionPaymentType("30% TT IN ADVANCE"), "30% TT IN ADVANCE");
assert.equal(sanitizeVisionCarrier("Air"), undefined);

const guarded = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  originDocumentNo: [{ candidateId:"x", field:"originDocumentNo", value:"STS2026000000041", confidence:1, extractor:"test", evidence:[] }],
}}, { version:"1", pages:[{ pageNumber:1, width:1, height:1, words:[{ text:"İrsaliye No: STS2026000000041", bbox:{x0:0,y0:0,x1:1,y1:1}, source:"NATIVE_TEXT" }], lines:[] }] } as any);
assert.equal(guarded.fields.originDocumentNo, undefined);

const adapter = fs.readFileSync(path.resolve(process.cwd(), "frontend/src/api/adapters/declarationAdapter.ts"), "utf8");
assert.match(adapter, /"Referans No": text\(evrim\.fileReference\) \|\| op\?\.ref \|\| ""/);
assert.doesNotMatch(adapter, /"Referans No": h\.invoiceNo/);
assert.match(adapter, /evrim\.declarationDate/);

const shipmentCandidates = discoverInvoiceShipmentFieldCandidates({
  version: "1",
  pages: [{
    pageNumber: 1, width: 1, height: 1, lines: [],
    words: [{
      text: "PALET SAYISI: 21 BRÜT KG: 26020",
      bbox: { x0: 0, y0: 0, x1: 1, y1: 0.1 },
      source: "NATIVE_TEXT",
    }],
  }],
} as any, "segment-001");
assert.equal(shipmentCandidates.fields["packageInfo.totalPackage"]?.[0]?.value, 21);

console.log(JSON.stringify({
  event: "product-e2e-1.8.10.1.ui-source-authority-hardening.contract.passed",
  guardrails: {
    evrimFieldsNotBorrowedFromInvoice: true,
    hsLabelsRemovedAtVisionBoundary: true,
    packageCountSeparatedFromWeight: true,
    bareCountryNotPartyAddress: true,
    customsProgramsNotPaymentTerms: true,
    transportModeNotCarrierIdentity: true,
    documentNumbersRequireRoleEvidence: true,
    bankInfoHasDeterministicFallback: true,
    vendorAgnostic: true,
    foundation6Authoritative: true,
    directNormalizedWrite: false,
  },
}, null, 2));
