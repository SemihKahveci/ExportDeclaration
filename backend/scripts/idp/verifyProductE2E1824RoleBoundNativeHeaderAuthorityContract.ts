import assert from "node:assert/strict";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";

const native = (candidateId: string, field: string, value: unknown) => ({
  candidateId, field, value, confidence: 0.96, extractor: "invoice-header-party-generic-v5",
  logicalDocumentId: "doc-1", uploadedFileId: "file-1", documentType: "INVOICE",
  sourceProcessingRunId: "run-1", derived: false,
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" as const, text: String(value) }]
});
const vision = (candidateId: string, field: string, value: unknown, pageNumber = 2) => ({
  candidateId, field, value, confidence: 1, extractor: "invoice-qwen-vision-v1",
  logicalDocumentId: "doc-1", uploadedFileId: "file-1", documentType: "INVOICE",
  sourceProcessingRunId: "run-1", derived: false,
  evidence: [{ segmentId: "segment-001", pageNumber, contentSource: "PAGE_IMAGE" as const }]
});

const fields = {
  "parties.seller.name": [
    vision("seller-poison", "parties.seller.name", "Punane 73 Tallinn"),
    native("party-seller-name:f6-header-party", "parties.seller.name", "Vekmar Elektrik Sist.Yat.ve Tic.A.Ş.")
  ],
  "parties.seller.address": [
    vision("seller-address-poison", "parties.seller.address", "Quantity 2 ADT"),
    native("party-seller-address:f6-header-party", "parties.seller.address", "ITOSB 8. Cadde No:7 Tuzla Istanbul")
  ],
  "parties.buyer.name": [
    vision("buyer-poison", "parties.buyer.name", "Karayolu"),
    native("party-buyer-name:f6-header-party", "parties.buyer.name", "POWER TECHNOLOGY OU")
  ],
  "parties.buyer.address": [
    vision("buyer-address-poison", "parties.buyer.address", "2"),
    native("party-buyer-address:f6-header-party", "parties.buyer.address", "Punane 73 Tallinn Harju Maakond 13619")
  ],
  "parties.buyer.country": [
    vision("buyer-country-poison", "parties.buyer.country", "2"),
    native("party-buyer-country:f6-header-party", "parties.buyer.country", "ESTONYA")
  ],
  invoiceDate: [
    vision("date-poison", "invoiceDate", "2026-01-01"),
    native("header-invoice-date:f6-header-party", "invoiceDate", "2026-06-05")
  ],
  // A native-looking candidate with the wrong id must not gain header authority.
  "parties.seller.country": [native("untrusted-native-country", "parties.seller.country", "TURKIYE")]
} as any;

const selections = selectDirectSourceEvidenceAuthority({ version: "1", fields } as any);
const selected = Object.fromEntries(selections.map((item) => [item.field, item.candidateId]));

assert.equal(selected["parties.seller.name"], "party-seller-name:f6-header-party");
assert.equal(selected["parties.seller.address"], "party-seller-address:f6-header-party");
assert.equal(selected["parties.buyer.name"], "party-buyer-name:f6-header-party");
assert.equal(selected["parties.buyer.address"], "party-buyer-address:f6-header-party");
assert.equal(selected["parties.buyer.country"], "party-buyer-country:f6-header-party");
assert.equal(selected.invoiceDate, "header-invoice-date:f6-header-party");
assert.equal(selected["parties.seller.country"], undefined);

const namespaced = selectDirectSourceEvidenceAuthority({ version: "1", fields: {
  invoiceDate: [
    vision("date-poison", "invoiceDate", "2024-10-01"),
    native("file-a:header-invoice-date:f6-header-party", "invoiceDate", "2026-10-01"),
    { ...native("file-b:header-invoice-date:f6-header-party", "invoiceDate", "2026-10-01"), uploadedFileId: "file-b" }
  ],
  invoiceNo: [
    native("file-a:header-invoice-no:f6-header-party", "invoiceNo", "VED2026000000272"),
    { ...native("file-b:header-invoice-no:f6-header-party", "invoiceNo", "VED2026000000273"), uploadedFileId: "file-b" }
  ]
} } as any);
assert.equal(namespaced.find((item) => item.field === "invoiceDate")?.candidateId, "file-a:header-invoice-date:f6-header-party");
assert.equal(namespaced.some((item) => item.field === "invoiceNo"), false);

console.log(JSON.stringify({
  event: "product-e2e-1.8.24.role-bound-native-header-authority.contract.passed",
  guardrails: {
    deterministicHeaderCanSelectFoundation6Authority: true,
    conflictingVisionCannotOutrankRoleBoundNativeHeader: true,
    arbitraryNativeCandidateCannotOptIntoHeaderAuthority: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false
  }
}, null, 2));
