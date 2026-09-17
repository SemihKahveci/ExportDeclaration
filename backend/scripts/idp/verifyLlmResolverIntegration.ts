import assert from "node:assert/strict";

import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope
} from "../../src/modules/idp/domain/candidateExtraction.types.js";
import { CandidateResolutionStatus } from "../../src/modules/idp/domain/candidateResolution.types.js";
import {
  LlmResolveDecision,
  type LlmProvider,
  type LlmResolveRequest,
  type LlmResolveResponse
} from "../../src/modules/idp/domain/llmResolve.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { resolveCandidatesWithLlm } from "../../src/modules/idp/llm/resolveCandidatesWithLlm.js";

function envelope(count: number): CandidateExtractionEnvelope {
  return {
    version: "1",
    segments: Array.from({ length: count }, (_, index) => ({
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      documentType: ClassifiedDocumentType.INVOICE,
      status: CandidateExtractionStatus.EXTRACTED,
      extractor: "invoice-canonical-v1",
      pageNumbers: [index + 1],
      data: { invoiceNo: `INV-${index + 1}` }
    }))
  };
}

class FakeProvider implements LlmProvider {
  readonly name = "fake-qwen";
  calls = 0;

  constructor(
    private readonly handler: (request: LlmResolveRequest) => Promise<LlmResolveResponse>
  ) {}

  async resolveCandidates(request: LlmResolveRequest): Promise<LlmResolveResponse> {
    this.calls += 1;
    return this.handler(request);
  }
}

function response(overrides: Partial<LlmResolveResponse> = {}): LlmResolveResponse {
  return {
    version: "1",
    decision: LlmResolveDecision.RESOLVED,
    sourceSegmentIds: ["segment-002"],
    data: { invoiceNo: "INV-2" },
    issues: [],
    model: "qwen-test",
    provider: "fake-qwen",
    ...overrides
  };
}

async function main() {
  const cases: Array<Record<string, unknown>> = [];

  {
    const provider = new FakeProvider(async () => response());
    const result = await resolveCandidatesWithLlm(envelope(0), { llmEnabled: true, provider });
    assert.equal(result.status, CandidateResolutionStatus.REVIEW_REQUIRED);
    assert.equal(result.issues[0]?.code, "NO_INVOICE_CANDIDATE");
    assert.equal(provider.calls, 0);
    cases.push({ name: "zero-candidate", status: result.status, providerCalls: provider.calls });
  }

  {
    const provider = new FakeProvider(async () => response());
    const result = await resolveCandidatesWithLlm(envelope(1), { llmEnabled: true, provider });
    assert.equal(result.status, CandidateResolutionStatus.RESOLVED);
    assert.equal(result.strategy, "SINGLE_CANDIDATE");
    assert.equal(provider.calls, 0);
    cases.push({ name: "single-candidate", strategy: result.strategy, providerCalls: provider.calls });
  }

  {
    const provider = new FakeProvider(async () => response());
    const result = await resolveCandidatesWithLlm(envelope(2), { llmEnabled: false, provider });
    assert.equal(result.status, CandidateResolutionStatus.REVIEW_REQUIRED);
    assert.equal(result.issues[0]?.code, "MULTIPLE_INVOICE_CANDIDATES");
    assert.equal(provider.calls, 0);
    cases.push({ name: "ambiguous-llm-disabled", status: result.status, providerCalls: provider.calls });
  }

  {
    const provider = new FakeProvider(async () => response());
    const result = await resolveCandidatesWithLlm(envelope(2), { llmEnabled: true, provider });
    assert.equal(result.status, CandidateResolutionStatus.RESOLVED);
    assert.equal(result.strategy, "LLM");
    assert.deepEqual(result.sourceSegmentIds, ["segment-002"]);
    assert.deepEqual(result.data, { invoiceNo: "INV-2" });
    assert.deepEqual(result.llmAudit, { provider: "fake-qwen", model: "qwen-test" });
    assert.equal(provider.calls, 1);
    cases.push({ name: "ambiguous-llm-resolved", strategy: result.strategy, providerCalls: provider.calls });
  }

  {
    const provider = new FakeProvider(async () => response({
      sourceSegmentIds: ["segment-999"],
      data: { invoiceNo: "HALLUCINATED" }
    }));
    const result = await resolveCandidatesWithLlm(envelope(2), { llmEnabled: true, provider });
    assert.equal(result.status, CandidateResolutionStatus.REVIEW_REQUIRED);
    assert.equal(result.issues[0]?.code, "LLM_INVALID_SOURCE_SEGMENT");
    assert.equal(result.data, undefined);
    cases.push({ name: "hallucinated-segment", status: result.status, issue: result.issues[0]?.code });
  }

  {
    const provider = new FakeProvider(async () => response({
      decision: LlmResolveDecision.REVIEW_REQUIRED,
      sourceSegmentIds: ["segment-001", "segment-002"],
      data: undefined,
      issues: [{ code: "AMBIGUOUS", message: "still ambiguous" }]
    }));
    const result = await resolveCandidatesWithLlm(envelope(2), { llmEnabled: true, provider });
    assert.equal(result.status, CandidateResolutionStatus.REVIEW_REQUIRED);
    assert.equal(result.issues[0]?.code, "LLM_REVIEW_REQUIRED");
    assert.equal(result.data, undefined);
    cases.push({ name: "llm-review-required", status: result.status, issue: result.issues[0]?.code });
  }

  {
    const provider = new FakeProvider(async () => {
      throw new Error("mock timeout");
    });
    const result = await resolveCandidatesWithLlm(envelope(2), { llmEnabled: true, provider });
    assert.equal(result.status, CandidateResolutionStatus.REVIEW_REQUIRED);
    assert.equal(result.issues[0]?.code, "LLM_RESOLUTION_FAILED");
    assert.equal(result.data, undefined);
    cases.push({ name: "provider-failure", status: result.status, issue: result.issues[0]?.code });
  }

  console.log(JSON.stringify({
    event: "idp.llm-resolver-integration.regression.passed",
    cases
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "idp.llm-resolver-integration.regression.failed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
