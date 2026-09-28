import assert from "node:assert/strict";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const base = { logicalDocumentId: "ld-1", uploadedFileId: "uf-1", documentType: "INVOICE" as const, sourceProcessingRunId: "run-1" };
const ev = (contentSource: "NATIVE_TEXT" | "PAGE_IMAGE") => [{ segmentId: "segment-001", pageNumber: 1, contentSource }];
const candidate = (id: string, field: string, value: unknown, source: "NATIVE_TEXT" | "PAGE_IMAGE", confidence = .98) => ({
  ...base, candidateId: id, field, value, confidence, extractor: source === "NATIVE_TEXT" ? "invoice-commercial-terms-generic-v2" : "qwen-vision", evidence: ev(source)
});

const envelope: DeclarationFieldCandidateEnvelope = {
  version: "1", companyId: "company", declarationId: "declaration", fields: {
    deliveryTerm: [
      candidate("native-cip", "deliveryTerm", "CIP", "NATIVE_TEXT", .98),
      candidate("vision-ihracat", "deliveryTerm", "IHRACAT", "PAGE_IMAGE", .99)
    ],
    "goodsLines.0.hsCode": [
      candidate("native-gtip", "goodsLines.0.hsCode", "610510000000", "NATIVE_TEXT", .98),
      candidate("vision-gtip", "goodsLines.0.hsCode", "610510000009", "PAGE_IMAGE", .99)
    ],
    currency: [
      candidate("native-eur", "currency", "EUR", "NATIVE_TEXT", .98),
      candidate("vision-usd", "currency", "USD", "PAGE_IMAGE", .99)
    ]
  }
};
const selections = selectDirectSourceEvidenceAuthority(envelope as any);
assert.deepEqual(selections, [
  { field: "deliveryTerm", candidateId: "native-cip", source: "DIRECT_SOURCE_EVIDENCE" },
  { field: "goodsLines.0.hsCode", candidateId: "native-gtip", source: "DIRECT_SOURCE_EVIDENCE" }
]);
const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
assert.equal(resolution.fields.deliveryTerm?.status, "RESOLVED");
assert.equal(resolution.fields.deliveryTerm?.value, "CIP");
assert.equal(resolution.fields.deliveryTerm?.method, "EXPLICIT_CANDIDATE_AUTHORITY");
assert.equal(resolution.fields.deliveryTerm?.candidates.length, 2);
assert.equal(resolution.fields["goodsLines.0.hsCode"]?.value, "610510000000");
assert.equal(resolution.fields.currency?.status, "REVIEW_REQUIRED");

const conflictingNative: DeclarationFieldCandidateEnvelope = {
  ...envelope,
  fields: { deliveryTerm: [candidate("native-cip-2", "deliveryTerm", "CIP", "NATIVE_TEXT"), candidate("native-dap", "deliveryTerm", "DAP", "NATIVE_TEXT")] }
};
assert.deepEqual(selectDirectSourceEvidenceAuthority(conflictingNative as any), []);
assert.equal(resolveDeclarationFields({ candidates: conflictingNative }).fields.deliveryTerm?.status, "REVIEW_REQUIRED");

const nonIncoterm: DeclarationFieldCandidateEnvelope = {
  ...envelope,
  fields: { deliveryTerm: [candidate("native-export", "deliveryTerm", "IHRACAT", "NATIVE_TEXT"), candidate("vision-cip", "deliveryTerm", "CIP", "PAGE_IMAGE")] }
};
assert.deepEqual(selectDirectSourceEvidenceAuthority(nonIncoterm as any), []);

console.log(JSON.stringify({
  event: "product-e2e-1.5.11.direct-source-delivery-term-authority.passed",
  unambiguousNativeIncotermSelected: true,
  conflictingVisionCandidateRetainedForAudit: true,
  conflictingNativeIncotermsStillFailClosed: true,
  nonIncotermNativeTextDoesNotGainAuthority: true,
  gtipAuthorityUnchanged: true,
  unrelatedFieldsUnchanged: true,
  foundation6ExplicitAuthorityUsed: true,
  noModelInferenceRequired: true,
  directNormalizedWrite: false
}, null, 2));
