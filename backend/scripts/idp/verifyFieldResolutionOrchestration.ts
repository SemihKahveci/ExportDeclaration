import assert from "node:assert/strict";
import { CandidateExtractionStatus, type CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";
import { CandidateResolutionStatus } from "../../src/modules/idp/domain/candidateResolution.types.js";
import type { FieldCandidate } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { resolveCandidatesWithLlm } from "../../src/modules/idp/llm/resolveCandidatesWithLlm.js";

function fc(id: string, field: string, value: unknown): FieldCandidate {
  return { candidateId: id, field, value, confidence: 0.95, extractor: "test", evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" }] };
}

function envelope(fields: Record<string, FieldCandidate[]>): CandidateExtractionEnvelope {
  return { version: "1", segments: [{
    segmentId: "segment-001",
    documentType: ClassifiedDocumentType.INVOICE,
    status: CandidateExtractionStatus.EXTRACTED,
    extractor: "invoice-canonical-v1",
    pageNumbers: [1],
    data: { goodsLines: [{ lineNo: 1 }], fieldCandidates: { version: "1", fields } }
  }] };
}

async function main() {
  const resolved = await resolveCandidatesWithLlm(envelope({
    "goodsLines.0.hsCode": [fc("gtip-1", "goodsLines.0.hsCode", "853620900019")]
  }), { llmEnabled: false });
  assert.equal(resolved.status, CandidateResolutionStatus.RESOLVED);
  assert.equal(resolved.strategy, "SINGLE_CANDIDATE");
  assert.equal(resolved.fieldResolution?.status, "RESOLVED");
  assert.equal(resolved.fieldResolution?.summary.ambiguousCount, 0);

  const ambiguous = await resolveCandidatesWithLlm(envelope({
    "goodsLines.0.hsCode": [
      fc("gtip-1", "goodsLines.0.hsCode", "853620900019"),
      fc("gtip-2", "goodsLines.0.hsCode", "853620100019")
    ]
  }), { llmEnabled: false });
  assert.equal(ambiguous.status, CandidateResolutionStatus.REVIEW_REQUIRED);
  assert.equal(ambiguous.strategy, "MANUAL_REVIEW");
  assert.equal(ambiguous.issues[0]?.code, "FIELD_CANDIDATE_AMBIGUITY");
  assert.equal(ambiguous.data, undefined, "ambiguous field candidates must not be promoted");
  assert.equal(ambiguous.fieldResolution?.summary.ambiguousCount, 1);

  console.log(JSON.stringify({
    event: "idp.field-resolution-orchestration.regression.passed",
    cases: [
      { name: "single-field-value", status: resolved.status, fieldStatus: resolved.fieldResolution?.status },
      { name: "conflicting-field-values", status: ambiguous.status, issue: ambiguous.issues[0]?.code }
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "idp.field-resolution-orchestration.regression.failed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
