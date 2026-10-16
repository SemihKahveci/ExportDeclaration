import assert from "node:assert/strict";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const canonical = {
  version: "1",
  pages: [{
    pageNumber: 1,
    nativeText: "VEKMAR ELEKTRIK SIST.YAT.VE TIC.A.S. 8. Cadde Itosb No:7 Tuzla ISTANBUL POWER TECHNOLOGY OU Punane 73 Tallinn Harju Maakond 13619",
    ocrText: "",
    words: [], lines: [], width: 1, height: 1
  }, {
    pageNumber: 2,
    nativeText: "Karayolu Quantity 2 Unit ADT",
    ocrText: "",
    words: [], lines: [], width: 1, height: 1
  }]
} as unknown as CanonicalDocument;

const c = (candidateId: string, field: string, value: unknown, pageNumber: number) => ({
  candidateId, field, value, confidence: 1, extractor: "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber, contentSource: "PAGE_IMAGE" as const }]
});

const input: FieldCandidateEnvelope = { version: "1", fields: {
  "parties.seller.name": [c("seller-good", "parties.seller.name", "VEKMAR ELEKTRIK SIST.YAT.VE TIC.A.S.", 1), c("seller-bad", "parties.seller.name", "Punane 73 Tallinn Harju Maakond 13619", 1)],
  "parties.buyer.name": [c("buyer-good", "parties.buyer.name", "POWER TECHNOLOGY OU", 1), c("buyer-bad", "parties.buyer.name", "Karayolu", 2)],
  "parties.buyer.address": [c("buyer-address", "parties.buyer.address", "Punane 73 Tallinn Harju Maakond 13619", 1)]
}};

const guarded = enforceVisionDocumentRoleAuthority(input, canonical);
assert.deepEqual(guarded.fields["parties.seller.name"]?.map(x => x.candidateId), ["seller-good"]);
assert.deepEqual(guarded.fields["parties.buyer.name"]?.map(x => x.candidateId), ["buyer-good"]);
assert.deepEqual(guarded.fields["parties.buyer.address"]?.map(x => x.candidateId), ["buyer-address"]);
console.log(JSON.stringify({ event: "product-e2e-1.8.17.corroborated-party-authority.contract.passed", supplierSpecificRules: false, modelInferenceRequired: false }));
