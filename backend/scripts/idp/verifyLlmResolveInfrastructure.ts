import assert from "node:assert/strict";
import { CandidateExtractionStatus, type CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { decideLlmResolvePolicy, LlmResolvePolicyDecision } from "../../src/modules/idp/llm/llmResolvePolicy.js";

function envelope(count: number): CandidateExtractionEnvelope {
  return {
    version: "1",
    segments: Array.from({ length: count }, (_, i) => ({
      segmentId: `segment-${i + 1}`,
      documentType: ClassifiedDocumentType.INVOICE,
      status: CandidateExtractionStatus.EXTRACTED,
      pageNumbers: [i + 1],
      data: { invoiceNo: `INV-${i + 1}` }
    }))
  };
}

const zero = decideLlmResolvePolicy(envelope(0));
const one = decideLlmResolvePolicy(envelope(1));
const two = decideLlmResolvePolicy(envelope(2));
assert.equal(zero, LlmResolvePolicyDecision.SKIP_NO_USABLE_CANDIDATE);
assert.equal(one, LlmResolvePolicyDecision.SKIP_DETERMINISTIC_SINGLE);
assert.equal(two, LlmResolvePolicyDecision.ALLOW_AMBIGUOUS_CANDIDATES);

console.log(JSON.stringify({
  event: "idp.llm-resolve-infrastructure.regression.passed",
  cases: [
    { name: "zero-candidate", decision: zero },
    { name: "single-candidate", decision: one },
    { name: "multiple-candidates", decision: two }
  ]
}, null, 2));
