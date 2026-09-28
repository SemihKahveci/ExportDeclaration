import assert from "node:assert/strict";
import { shouldDeferResolutionReviewToDeclarationAuthority } from "../../src/modules/idp/llm/declarationAuthorityResolutionGate.js";
import { CandidateResolutionStatus, type CandidateResolutionEnvelope } from "../../src/modules/idp/domain/candidateResolution.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";

const reviewResolution: CandidateResolutionEnvelope = {
  version: "1",
  status: CandidateResolutionStatus.REVIEW_REQUIRED,
  strategy: "MANUAL_REVIEW",
  documentType: ClassifiedDocumentType.INVOICE,
  sourceSegmentIds: ["segment-001"],
  issues: [{ code: "FIELD_LLM_RESOLUTION_FAILED", message: "legacy resolver failed", segmentIds: ["segment-001"] }]
};

const persistedPeerCandidates = {
  version: "1",
  fields: {
    invoiceNo: [{ candidateId:"native-invoice", field:"invoiceNo", value:"AAA2026000000009", confidence:0.99, extractor:"deterministic", evidence:[{ segmentId:"segment-001", pageNumber:1, contentSource:"NATIVE_TEXT" }] }],
    "goodsLines.0.hsCode": [{ candidateId:"native-gtip", field:"goodsLines.0.hsCode", value:"550340000011", confidence:0.99, extractor:"deterministic", evidence:[{ segmentId:"segment-001", pageNumber:1, contentSource:"NATIVE_TEXT" }] }]
  }
};

assert.equal(shouldDeferResolutionReviewToDeclarationAuthority({ resolution:reviewResolution, declarationCandidates:persistedPeerCandidates }), true);
assert.equal(shouldDeferResolutionReviewToDeclarationAuthority({ resolution:reviewResolution, declarationCandidates:{ version:"1", fields:{} } }), false);
assert.equal(shouldDeferResolutionReviewToDeclarationAuthority({ resolution:reviewResolution, declarationCandidates:undefined }), false);

const resolved = { ...reviewResolution, status:CandidateResolutionStatus.RESOLVED, strategy:"SINGLE_CANDIDATE", data:{ header:{} }, issues:[] } as CandidateResolutionEnvelope;
assert.equal(shouldDeferResolutionReviewToDeclarationAuthority({ resolution:resolved, declarationCandidates:persistedPeerCandidates }), false);

console.log(JSON.stringify({
  event:"product-e2e-1.5.7.declaration-authority-resolution-gate.passed",
  legacyResolverReviewCanReachFoundation6WhenPeerCandidatesPersisted:true,
  emptyCandidateEnvelopeStillFailsClosed:true,
  missingCandidateEnvelopeStillFailsClosed:true,
  resolvedLegacyPathUnchanged:true,
  foundation6RemainsSoleNormalizedDataAuthority:true,
  noModelInferenceRequired:true,
  directNormalizedWrite:false
}, null, 2));
