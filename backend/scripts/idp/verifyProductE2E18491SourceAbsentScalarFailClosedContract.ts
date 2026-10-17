import assert from "node:assert/strict";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { enforceVisionSourceBackedCommercialNumericAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const visionCandidate = (field: string, value: unknown) => ({
  candidateId: `vision:${field}:${String(value)}`,
  field,
  value,
  extractor: "invoice-qwen-vision-v1",
  confidence: 1,
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }]
});
const nativeCandidate = (field: string, value: unknown) => ({
  candidateId: `native:${field}:${String(value)}`,
  field,
  value,
  extractor: "invoice-commercial-terms-generic-v2",
  confidence: 0.99,
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" as const, text: `${field}: ${String(value)}` }]
});

const vision: FieldCandidateEnvelope = { version: "1", fields: {
  exchangeRate: [visionCandidate("exchangeRate", 0.7)],
  freight: [visionCandidate("freight", "0,00 USD")],
  insurance: [visionCandidate("insurance", 0)],
  totalAmount: [visionCandidate("totalAmount", "17.500,00 USD")]
}};
const absentAuthority: FieldCandidateEnvelope = { version: "1", fields: {} };
const absent = enforceVisionSourceBackedCommercialNumericAuthority(vision, absentAuthority);
assert.equal(absent.fields.exchangeRate, undefined);
assert.equal(absent.fields.freight, undefined);
assert.equal(absent.fields.insurance, undefined);
assert.equal(absent.fields.totalAmount?.[0]?.value, "17.500,00 USD");

const explicitAuthority: FieldCandidateEnvelope = { version: "1", fields: {
  exchangeRate: [nativeCandidate("exchangeRate", "55,85130")],
  freight: [nativeCandidate("freight", 0)],
  insurance: [nativeCandidate("insurance", "0,00 EUR")]
}};
const matchingVision: FieldCandidateEnvelope = { version: "1", fields: {
  exchangeRate: [visionCandidate("exchangeRate", 55.8513)],
  freight: [visionCandidate("freight", "0,00")],
  insurance: [visionCandidate("insurance", 0)]
}};
const explicit = enforceVisionSourceBackedCommercialNumericAuthority(matchingVision, explicitAuthority);
assert.equal(explicit.fields.exchangeRate?.length, 1);
assert.equal(explicit.fields.freight?.length, 1);
assert.equal(explicit.fields.insurance?.length, 1);

const conflictingVision: FieldCandidateEnvelope = { version: "1", fields: {
  exchangeRate: [visionCandidate("exchangeRate", 0.7), visionCandidate("exchangeRate", 55.8513)]
}};
const conflict = enforceVisionSourceBackedCommercialNumericAuthority(conflictingVision, explicitAuthority);
assert.deepEqual(conflict.fields.exchangeRate?.map((candidate) => candidate.value), [55.8513]);

console.log(JSON.stringify({
  event: "product-e2e-1.8.49.1.source-absent-scalar-fail-closed.contract.passed",
  acceptance: {
    sourceAbsentExchangeRateRejected: true,
    sourceAbsentFreightZeroRejected: true,
    sourceAbsentInsuranceZeroRejected: true,
    explicitExchangeRatePreserved: true,
    explicitFreightZeroPreserved: true,
    explicitInsuranceZeroPreserved: true,
    conflictingVisionNumericRejected: true,
    unrelatedTotalUntouched: true
  },
  guardrails: {
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    fixedColumnCoordinates: false,
    directNormalizedWrite: false,
    modelInferenceRequired: false
  }
}, null, 2));
