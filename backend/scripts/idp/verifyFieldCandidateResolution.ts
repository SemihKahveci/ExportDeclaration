import assert from "node:assert/strict";

import {
  FieldResolutionMethod,
  FieldResolutionStatus,
  type FieldCandidate,
  type FieldCandidateEnvelope
} from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { resolveFieldCandidates } from "../../src/modules/idp/resolver/fieldCandidateResolver.js";

function candidate(candidateId: string, field: string, value: unknown, confidence = 0.9): FieldCandidate {
  return {
    candidateId,
    field,
    value,
    confidence,
    extractor: "test",
    evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" }]
  };
}

const envelope: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    "goodsLines.0.hsCode": [candidate("gtip-1", "goodsLines.0.hsCode", "853620900019", 0.99)],
    "goodsLines.0.quantity": [
      candidate("qty-1", "goodsLines.0.quantity", 15, 0.90),
      candidate("qty-2", "goodsLines.0.quantity", 15, 0.97)
    ],
    "goodsLines.0.productCode": [
      candidate("code-1", "goodsLines.0.productCode", "C25B4", 0.95),
      candidate("code-2", "goodsLines.0.productCode", "C25B8", 0.94)
    ]
  }
};

const result = resolveFieldCandidates(envelope);
assert.equal(result.status, FieldResolutionStatus.AMBIGUOUS);
assert.equal(result.summary.fieldCount, 3);
assert.equal(result.summary.resolvedCount, 2);
assert.equal(result.summary.ambiguousCount, 1);

const hs = result.fields["goodsLines.0.hsCode"]!;
assert.equal(hs.status, FieldResolutionStatus.RESOLVED);
assert.equal(hs.method, FieldResolutionMethod.SINGLE_VALUE);
assert.equal(hs.selectedCandidateId, "gtip-1");
assert.equal(hs.value, "853620900019");

const qty = result.fields["goodsLines.0.quantity"]!;
assert.equal(qty.status, FieldResolutionStatus.RESOLVED);
assert.equal(qty.method, FieldResolutionMethod.CONSENSUS);
assert.equal(qty.selectedCandidateId, "qty-2", "consensus should retain highest-confidence provenance");
assert.equal(qty.value, 15);

const code = result.fields["goodsLines.0.productCode"]!;
assert.equal(code.status, FieldResolutionStatus.AMBIGUOUS);
assert.equal(code.method, FieldResolutionMethod.AMBIGUOUS);
assert.equal(code.selectedCandidateId, undefined);
assert.equal(code.value, undefined);

console.log(JSON.stringify({
  event: "idp.field-candidate-resolution.regression.passed",
  status: result.status,
  summary: result.summary,
  fields: {
    hsCode: { method: hs.method, selectedCandidateId: hs.selectedCandidateId, value: hs.value },
    quantity: { method: qty.method, selectedCandidateId: qty.selectedCandidateId, value: qty.value },
    productCode: { method: code.method, candidateIds: code.candidateIds }
  }
}, null, 2));
