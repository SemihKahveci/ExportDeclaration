import assert from "node:assert/strict";

import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope,
  type SegmentCandidateResult
} from "../../src/modules/idp/domain/candidateExtraction.types.js";
import {
  CandidateResolutionStatus,
  type CandidateResolutionEnvelope
} from "../../src/modules/idp/domain/candidateResolution.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { resolveCandidates } from "../../src/modules/idp/resolver/candidateResolver.js";

function invoiceCandidate(segmentId: string, marker: string): SegmentCandidateResult {
  return {
    segmentId,
    documentType: ClassifiedDocumentType.INVOICE,
    status: CandidateExtractionStatus.EXTRACTED,
    extractor: "invoice-canonical-v1",
    pageNumbers: [1],
    data: { marker }
  };
}

function envelope(segments: SegmentCandidateResult[]): CandidateExtractionEnvelope {
  return { version: "1", segments };
}

function assertNoResolvedData(result: CandidateResolutionEnvelope): void {
  assert.equal(
    Object.prototype.hasOwnProperty.call(result, "data"),
    false,
    "REVIEW_REQUIRED result must not expose resolved data"
  );
}

const noCandidate = resolveCandidates(envelope([]));
assert.equal(noCandidate.status, CandidateResolutionStatus.REVIEW_REQUIRED);
assert.equal(noCandidate.strategy, "MANUAL_REVIEW");
assert.equal(noCandidate.documentType, null);
assert.deepEqual(noCandidate.sourceSegmentIds, []);
assert.equal(noCandidate.issues.length, 1);
assert.equal(noCandidate.issues[0]?.code, "NO_INVOICE_CANDIDATE");
assertNoResolvedData(noCandidate);

const singleData = { marker: "single", goodsLines: [{ lineNo: 1 }] };
const singleCandidate = invoiceCandidate("segment-001", "unused");
singleCandidate.data = singleData;
const single = resolveCandidates(envelope([singleCandidate]));
assert.equal(single.status, CandidateResolutionStatus.RESOLVED);
assert.equal(single.strategy, "SINGLE_CANDIDATE");
assert.equal(single.documentType, ClassifiedDocumentType.INVOICE);
assert.deepEqual(single.sourceSegmentIds, ["segment-001"]);
assert.deepEqual(single.issues, []);
assert.strictEqual(single.data, singleData, "single candidate data must be promoted unchanged");

const multiple = resolveCandidates(
  envelope([
    invoiceCandidate("segment-001", "first"),
    invoiceCandidate("segment-002", "second")
  ])
);
assert.equal(multiple.status, CandidateResolutionStatus.REVIEW_REQUIRED);
assert.equal(multiple.strategy, "MANUAL_REVIEW");
assert.equal(multiple.documentType, ClassifiedDocumentType.INVOICE);
assert.deepEqual(multiple.sourceSegmentIds, ["segment-001", "segment-002"]);
assert.equal(multiple.issues.length, 1);
assert.equal(multiple.issues[0]?.code, "MULTIPLE_INVOICE_CANDIDATES");
assert.deepEqual(multiple.issues[0]?.segmentIds, ["segment-001", "segment-002"]);
assertNoResolvedData(multiple);

console.log(
  JSON.stringify(
    {
      event: "idp.candidate-resolution.regression.passed",
      cases: [
        { name: "no-candidate", status: noCandidate.status, issue: noCandidate.issues[0]?.code },
        { name: "single-candidate", status: single.status, strategy: single.strategy },
        { name: "multiple-candidates", status: multiple.status, issue: multiple.issues[0]?.code }
      ]
    },
    null,
    2
  )
);
