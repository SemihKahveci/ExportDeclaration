import assert from "node:assert/strict";
import {
  discoverInvoiceHsFieldCandidates,
  hsLikeDigits
} from "../../src/modules/idp/candidates/invoiceHsCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

assert.equal(hsLikeDigits("330499"), "330499");
assert.equal(hsLikeDigits("8536.20.90.0019"), "853620900019");
assert.equal(hsLikeDigits("2026"), undefined);
assert.equal(hsLikeDigits("202401"), undefined);

function word(
  text: string,
  pageNumber: number,
  x0: number,
  y0: number,
  x1 = x0 + 0.06,
  y1 = y0 + 0.015
) {
  return {
    text,
    bbox: { x0, y0, x1, y1 },
    confidence: 1,
    source: "NATIVE_TEXT" as const
  };
}

// Derm-class: description-only Vision rows + stable 6-digit HS column (1:1 Y zip).
const dermCanonical = {
  documentId: "derm",
  pages: [{
    pageNumber: 1,
    width: 1,
    height: 1,
    words: [
      word("HS", 1, 0.08, 0.2),
      word("Codu", 1, 0.12, 0.2),
      word("330499", 1, 0.1, 0.28),
      word("330499", 1, 0.1, 0.36),
      word("330499", 1, 0.1, 0.44),
      word("330499", 1, 0.1, 0.52),
      word("Italy", 1, 0.22, 0.28),
      word("Italy", 1, 0.22, 0.36),
    ],
    nativeText: "HS Codu 330499 Italy",
    ocrText: ""
  }]
} as unknown as CanonicalDocument;

const dermGoods: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    "goodsLines.0.description": [{
      candidateId: "d0",
      field: "goodsLines.0.description",
      value: "1 FORMULA 1 - FACE - ETERNAL ECLAIR",
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.1.description": [{
      candidateId: "d1",
      field: "goodsLines.1.description",
      value: "2 FORMULA 2 - NECK",
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.2.description": [{
      candidateId: "d2",
      field: "goodsLines.2.description",
      value: "3 FORMULA 1 FOC",
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.3.description": [{
      candidateId: "d3",
      field: "goodsLines.3.description",
      value: "3 FORMULA 2 FOC",
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.0.quantity": [{
      candidateId: "q0",
      field: "goodsLines.0.quantity",
      value: 2000,
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.1.quantity": [{
      candidateId: "q1",
      field: "goodsLines.1.quantity",
      value: 2000,
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.2.quantity": [{
      candidateId: "q2",
      field: "goodsLines.2.quantity",
      value: 200,
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }],
    "goodsLines.3.quantity": [{
      candidateId: "q3",
      field: "goodsLines.3.quantity",
      value: 200,
      confidence: 0.9,
      extractor: "test",
      evidence: []
    }]
  }
};

const dermHs = discoverInvoiceHsFieldCandidates(dermCanonical, "seg-derm", dermGoods);
assert.equal(dermHs.fields["goodsLines.0.hsCode"]?.[0]?.value, "330499");
assert.equal(dermHs.fields["goodsLines.3.hsCode"]?.[0]?.value, "330499");

// Do not overwrite an existing Vision hsCode.
const withHs: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    ...dermGoods.fields,
    "goodsLines.0.hsCode": [{
      candidateId: "h0",
      field: "goodsLines.0.hsCode",
      value: "123456789012",
      confidence: 0.9,
      extractor: "vision",
      evidence: []
    }]
  }
};
const noOverwrite = discoverInvoiceHsFieldCandidates(dermCanonical, "seg-derm", withHs);
// Row 0 already has Vision hsCode — discovery must not emit a competing candidate.
assert.equal(noOverwrite.fields["goodsLines.0.hsCode"], undefined);

console.log({
  event: "foundation-8.25.7.hs-column-discovery.contract.passed",
  sixDigitHsAccepted: true,
  yearRejected: true,
  descriptionOnlyYOrderZip: true,
  existingVisionHsPreserved: true,
  corpusSpecificRules: false
});
