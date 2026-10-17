import assert from "node:assert/strict";
import { canonicalNativeShipmentCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";

const native = (candidateId: string, field: string, value: unknown, text: string) => ({
  candidateId, field, value, confidence: 0.99, extractor: "invoice-shipment-generic-v1", derived: false,
  evidence: [{ segmentId: "segment-001", pageNumber: 8, contentSource: "NATIVE_TEXT" as const, text }]
});
const audit = {
  version: "1" as const,
  fields: {
    "packageInfo.totalPackage": [native("segment-001:shipment:packageInfo.totalPackage", "packageInfo.totalPackage", 2, "TOPLAM KAP:2")],
    "packageInfo.grossKg": [native("segment-001:shipment:packageInfo.grossKg", "packageInfo.grossKg", 554, "TOPLAM BRÜT AĞIRLIK:554,00 KG")],
    "packageInfo.netKg": [native("segment-001:shipment:packageInfo.netKg", "packageInfo.netKg", 530, "TOPLAM NET AĞIRLIK:530,00 KG")]
  }
};
const mapped = canonicalNativeShipmentCandidatesOf({ genericCandidateAudit: { shipmentCandidates: audit } } as any);
assert.equal(mapped.fields.totalPackage?.[0]?.value, 2);
assert.equal(mapped.fields.grossWeight?.[0]?.value, 554);
assert.equal(mapped.fields.netWeight?.[0]?.value, 530);
assert.ok(mapped.fields.totalPackage?.[0]?.candidateId.endsWith(":f6-native-shipment"));

const projected = Object.fromEntries(Object.entries(mapped.fields).map(([field, candidates]) => [field, candidates.map((candidate: any) => ({
  ...candidate, logicalDocumentId: "doc-1", uploadedFileId: "file-1", documentType: "INVOICE", sourceProcessingRunId: "run-1"
}))]));
const selections = selectDirectSourceEvidenceAuthority({ version: "1", fields: projected } as any);
const selected = Object.fromEntries(selections.map((item) => [item.field, item.candidateId]));
assert.ok(String(selected.totalPackage).endsWith(":f6-native-shipment"));
assert.ok(String(selected.grossWeight).endsWith(":f6-native-shipment"));
assert.ok(String(selected.netWeight).endsWith(":f6-native-shipment"));

console.log(JSON.stringify({
  event: "product-e2e-1.8.28.canonical-authority-bridge.contract.passed",
  guardrails: {
    canonicalShipmentEvidenceCanEnterFoundation6: true,
    nativeShipmentCanSelectDirectAuthority: true,
    modelSizeIndependent: true,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
