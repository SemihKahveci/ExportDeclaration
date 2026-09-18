import assert from "node:assert/strict";
import { buildHumanReviewIssues } from "../../src/modules/idp/review/humanReview.service.js";

const candidate = {
  candidateId: "generic:goodsLines.0.productCode:0",
  field: "goodsLines.0.productCode",
  value: "ABC-123",
  confidence: 0.9,
  extractor: "test",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "OCR" as const, text: "ABC-123" }]
};

const run = {
  resolvedResult: {
    issues: [{ code: "FIELD_CANDIDATE_AMBIGUITY", message: "Ambiguous field", segmentIds: ["segment-001"] }]
  },
  validationResult: {
    issues: [{ code: "TEST_VALIDATION", message: "Needs review", path: "goodsLines.0.productCode", lineNo: 1 }]
  },
  candidates: {
    segments: [{
      data: {
        genericCandidateAudit: {
          candidates: { version: "1", fields: { "goodsLines.0.productCode": [candidate] } },
          validation: {
            rows: [{ rowIndex: 0, status: "REVIEW_REQUIRED", issues: [{ rowIndex: 0, field: "goodsLines.0.productCode", code: "MISSING_EVIDENCE", message: "Evidence missing" }] }]
          }
        }
      }
    }]
  }
};

const issues = buildHumanReviewIssues(run);
assert.equal(issues.length, 3);
assert.equal(issues[0]?.source, "RESOLVE");
assert.equal(issues[1]?.source, "VALIDATION");
assert.equal(issues[2]?.source, "GENERIC_EVIDENCE");
assert.deepEqual(issues[2]?.candidateIds, [candidate.candidateId]);
assert.equal(issues[2]?.evidence[0]?.text, "ABC-123");
assert.equal(new Set(issues.map(i => i.issueId)).size, issues.length);

console.log(JSON.stringify({ event: "idp.human-review.regression.passed", issueCount: issues.length, sources: issues.map(i => i.source) }, null, 2));
