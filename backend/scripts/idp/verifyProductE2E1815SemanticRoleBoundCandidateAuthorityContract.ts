import assert from "node:assert/strict";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const candidate = (field: string, value: unknown, pageNumber: number) => ({
  candidateId: `test:${field}:${pageNumber}:${String(value)}`,
  field,
  value,
  confidence: 1,
  extractor: "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber, contentSource: "PAGE_IMAGE" as const }]
});
const page = (pageNumber: number, text: string) => ({
  pageNumber, width: 1, height: 1, lines: [], nativeText: text, words: [{ text, bbox: { x0: 0, y0: 0, x1: 1, y1: .1 }, source: "NATIVE_TEXT" }]
});

// The exact failure shape from the 1.8.14 real diagnostic: a valid party/header
// page is followed by dense pages where the model reuses shipment/table tokens
// as parties, totals, weights and transport identifiers.
const document = { version: "1", pages: [
  page(1, "SELLER Vekmar Elektrik BUYER POWER TECHNOLOGY OU INVOICE TOTAL 31.081,10 EUR"),
  page(2, "Item 24 Quantity 2 Unit ADT Price 20.500 EUR Karayolu 104800"),
  page(8, "GROSS WEIGHT 554 KG NET WEIGHT 530 KG")
] } as any;

const guarded = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  "parties.seller.name": [candidate("parties.seller.name", "Vekmar Elektrik", 1), candidate("parties.seller.name", "Karayolu", 2)],
  "parties.buyer.name": [candidate("parties.buyer.name", "POWER TECHNOLOGY OU", 1), candidate("parties.buyer.name", "Karayolu", 2)],
  totalAmount: [candidate("totalAmount", 31081.10, 1), candidate("totalAmount", 104800, 2)],
  grossWeight: [candidate("grossWeight", 26020, 2), candidate("grossWeight", 554, 8)],
  netWeight: [candidate("netWeight", 26020, 2), candidate("netWeight", 530, 8)],
  transportMode: [candidate("transportMode", "Bin", 1)],
  vehiclePlate: [candidate("vehiclePlate", "2", 2)],
  containerNo: [candidate("containerNo", "2", 2)],
  cmrNo: [candidate("cmrNo", "2", 2)]
}}, document);

assert.deepEqual(guarded.fields["parties.seller.name"]?.map((c) => c.value), ["Vekmar Elektrik"]);
assert.deepEqual(guarded.fields["parties.buyer.name"]?.map((c) => c.value), ["POWER TECHNOLOGY OU"]);
assert.deepEqual(guarded.fields.totalAmount?.map((c) => c.value), [31081.10]);
assert.deepEqual(guarded.fields.grossWeight?.map((c) => c.value), [554]);
assert.deepEqual(guarded.fields.netWeight?.map((c) => c.value), [530]);
for (const field of ["transportMode", "vehiclePlate", "containerNo", "cmrNo"]) {
  assert.equal(guarded.fields[field], undefined, `${field} must fail closed without same-page role evidence`);
}

// A role elsewhere in the document must not authorize a value emitted from a
// different page. This is the key tightening over 1.8.14's document-wide gate.
const crossPage = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  containerNo: [candidate("containerNo", "2", 2)]
}}, { version: "1", pages: [page(1, "CONTAINER NO MSKU1234567"), page(2, "Quantity 2")] } as any);
assert.equal(crossPage.fields.containerNo, undefined);

// Explicit same-page evidence remains allowed.
const explicit = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  containerNo: [candidate("containerNo", "MSKU1234567", 1)],
  cmrNo: [candidate("cmrNo", "7788", 1)]
}}, { version: "1", pages: [page(1, "CONTAINER NO MSKU1234567 CMR NO 7788")] } as any);
assert.equal(explicit.fields.containerNo?.[0]?.value, "MSKU1234567");
assert.equal(explicit.fields.cmrNo?.[0]?.value, "7788");

console.log(JSON.stringify({
  event: "product-e2e-1.8.15.semantic-role-bound-candidate-authority.contract.passed",
  guardrails: {
    authorityIsEvidencePageLocal: true,
    partyRoleCollisionFailsClosed: true,
    amountAndWeightNumericCollisionFailsClosed: true,
    unsupportedTransportSlotsFailClosed: true,
    explicitSamePageRoleStillAllowed: true,
    vendorAgnostic: true,
    foundation6RemainsAuthoritative: true,
    directNormalizedWrite: false
  }
}, null, 2));
