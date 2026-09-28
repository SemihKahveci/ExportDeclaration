import assert from "node:assert/strict";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const base = { logicalDocumentId: "ld-1", uploadedFileId: "uf-1", documentType: "INVOICE" as const, sourceProcessingRunId: "run-1" };
const ev = (contentSource: "NATIVE_TEXT" | "PAGE_IMAGE") => [{ segmentId: "segment-001", pageNumber: 1, contentSource }];
const envelope: DeclarationFieldCandidateEnvelope = {
  version: "1", companyId: "company", declarationId: "declaration", fields: {
    "goodsLines.0.hsCode": [
      { ...base, candidateId: "native-correct", field: "goodsLines.0.hsCode", value: "610510000000", confidence: .99, extractor: "invoice-canonical-v1", evidence: ev("NATIVE_TEXT") },
      { ...base, candidateId: "vision-conflict", field: "goodsLines.0.hsCode", value: "610510000009", confidence: .98, extractor: "qwen-vision", evidence: ev("PAGE_IMAGE") }
    ],
    "goodsLines.1.hsCode": [
      { ...base, candidateId: "vision-only", field: "goodsLines.1.hsCode", value: "550340000011", confidence: .98, extractor: "qwen-vision", evidence: ev("PAGE_IMAGE") }
    ],
    "goodsLines.2.hsCode": [
      { ...base, candidateId: "native-a", field: "goodsLines.2.hsCode", value: "111111111111", confidence: .99, extractor: "native", evidence: ev("NATIVE_TEXT") },
      { ...base, candidateId: "native-b", field: "goodsLines.2.hsCode", value: "222222222222", confidence: .99, extractor: "native", evidence: ev("NATIVE_TEXT") }
    ],
    currency: [
      { ...base, candidateId: "native-eur", field: "currency", value: "EUR", confidence: .99, extractor: "native", evidence: ev("NATIVE_TEXT") },
      { ...base, candidateId: "vision-usd", field: "currency", value: "USD", confidence: .98, extractor: "vision", evidence: ev("PAGE_IMAGE") }
    ]
  }
};
const selections = selectDirectSourceEvidenceAuthority(envelope as any);
assert.deepEqual(selections, [{ field: "goodsLines.0.hsCode", candidateId: "native-correct", source: "DIRECT_SOURCE_EVIDENCE" }]);
const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
assert.equal(resolution.fields["goodsLines.0.hsCode"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.0.hsCode"]?.value, "610510000000");
assert.equal(resolution.fields["goodsLines.1.hsCode"]?.status, "RESOLVED");
assert.equal(resolution.fields["goodsLines.2.hsCode"]?.status, "REVIEW_REQUIRED");
assert.equal(resolution.fields.currency?.status, "REVIEW_REQUIRED");
assert.equal(resolution.fields["goodsLines.0.hsCode"]?.candidates.length, 2);
console.log(JSON.stringify({
  event: "product-e2e-1.5.9.direct-source-gtip-authority.passed",
  unambiguousNativeTwelveDigitGtipSelected: true,
  conflictingVisionCandidateRetainedForAudit: true,
  visionOnlyGtipUnchanged: true,
  conflictingNativeGtipsStillFailClosed: true,
  nonGtipFieldsUnchanged: true,
  foundation6ExplicitAuthorityUsed: true,
  noModelInferenceRequired: true,
  directNormalizedWrite: false
}, null, 2));
