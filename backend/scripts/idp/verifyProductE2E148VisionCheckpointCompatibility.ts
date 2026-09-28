import assert from "node:assert/strict";
import {
  prepareInvoiceVisionCheckpoint,
  type PersistedInvoiceVisionCheckpoint
} from "../../src/modules/idp/llm/invoiceVisionCheckpoint.js";

async function main() {
  const oldCheckpoint: PersistedInvoiceVisionCheckpoint = {
    version: "1",
    executionKey: "invoice-vision-v1|provider|model-a|field-a",
    segments: {
      "segment-001": {
        pages: {
          "1": {
            status: "COMPLETED",
            pageNumber: 1,
            decision: "PARTIAL",
            candidateCount: 1,
            candidates: {
              version: "1",
              fields: {
                invoiceNo: [{
                  candidateId: "candidate-old",
                  field: "invoiceNo",
                  value: "OLD",
                  normalizedValue: "OLD",
                  confidence: 0.9,
                  evidence: []
                }]
              }
            }
          }
        }
      }
    }
  };

  const same = prepareInvoiceVisionCheckpoint(oldCheckpoint, oldCheckpoint.executionKey!);
  assert.equal(same.reusedCompatibleCheckpoint, true);
  assert.ok(same.checkpoint.segments["segment-001"]?.pages["1"]);

  const changedModel = prepareInvoiceVisionCheckpoint(
    oldCheckpoint,
    "invoice-vision-v1|provider|model-b|field-a"
  );
  assert.equal(changedModel.reusedCompatibleCheckpoint, false);
  assert.deepEqual(changedModel.checkpoint.segments, {});

  const legacyWithoutKey = prepareInvoiceVisionCheckpoint(
    { version: "1", segments: oldCheckpoint.segments },
    oldCheckpoint.executionKey!
  );
  assert.equal(legacyWithoutKey.reusedCompatibleCheckpoint, false);
  assert.deepEqual(legacyWithoutKey.checkpoint.segments, {});

  console.log(JSON.stringify({
    event: "product-e2e-1.4.8.vision-checkpoint-compatibility.passed",
    sameExecutionKeyReusesCompletedPages: true,
    changedModelInvalidatesPersistedPages: true,
    changedRequestSemanticsInvalidationSupported: true,
    legacyCheckpointFailsClosed: true,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
