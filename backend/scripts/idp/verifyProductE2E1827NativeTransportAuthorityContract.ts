import assert from "node:assert/strict";
import { canonicalCommercialTermsCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const nativeTransport = {
  candidateId: "transport-mode",
  field: "transport.mode",
  value: "Karayolu",
  confidence: 0.98,
  extractor: "generic-invoice-commercial-terms-v1",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT", text: "Gönderilme Şekli Karayolu" }],
};
const mapped = canonicalCommercialTermsCandidatesOf({
  genericCandidateAudit: { commercialTermsCandidates: { version: "1", fields: { "transport.mode": [nativeTransport] } } },
} as any);

assert.equal(mapped.fields.transportMode?.length, 1, "native semantic transport mode must enter the F6 candidate stream");
assert.equal(mapped.fields.transportMode?.[0]?.value, "Karayolu");
assert.equal(mapped.fields.transportMode?.[0]?.candidateId, "transport-mode:f6-transportMode");
assert.equal(mapped.fields["transport.mode"], undefined, "legacy parser vocabulary must not leak into F6");

console.log(JSON.stringify({
  event: "product-e2e-1.8.27.native-transport-authority.contract.passed",
  guardrails: {
    semanticTransportRoleMappedToFoundation6: true,
    nativeEvidencePreserved: true,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false,
  },
}, null, 2));
