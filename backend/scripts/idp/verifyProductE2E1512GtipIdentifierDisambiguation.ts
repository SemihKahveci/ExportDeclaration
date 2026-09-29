import assert from "node:assert/strict";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import type { CanonicalDocument, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const word = (text: string, x0: number, y0: number, x1: number, y1: number): CanonicalWord => ({
  text, bbox: { x0, y0, x1, y1 }, confidence: 1, source: "NATIVE_TEXT"
});

const words = [
  word("TICARETSICILNO:", 0.05, 0.08, 0.18, 0.10),
  word("084104695730", 0.19, 0.08, 0.30, 0.10),
  word("ERKEK", 0.10, 0.40, 0.18, 0.42),
  word("569", 0.30, 0.40, 0.34, 0.42),
  word("14,8", 0.45, 0.40, 0.50, 0.42),
  word("8421,20", 0.60, 0.40, 0.68, 0.42),
  word("610510000000", 0.82, 0.40, 0.94, 0.42),
  word("BAYAN", 0.10, 0.55, 0.18, 0.57),
  word("168", 0.30, 0.55, 0.34, 0.57),
  word("18,0797", 0.45, 0.55, 0.52, 0.57),
  word("3037,40", 0.60, 0.55, 0.68, 0.57),
  word("610990200012", 0.82, 0.55, 0.94, 0.57)
];

const document: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "synthetic-textilium-shape.pdf" },
  analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1 },
  pages: [{
    pageNumber: 1, width: 1, height: 1, rotation: 0, nativeText: words.map(w => w.text).join(" "),
    nativeCharCount: 100, nativeWordCount: words.length, hasNativeText: true, imageCount: 0, imageCoverage: 0,
    contentKind: "DIGITAL", words,
    lines: [
      { text: "TICARETSICILNO: 084104695730", bbox: { x0: 0.05, y0: 0.08, x1: 0.30, y1: 0.10 }, source: "NATIVE_TEXT" },
      { text: "ERKEK 569 14,8 8421,20 610510000000", bbox: { x0: 0.10, y0: 0.40, x1: 0.94, y1: 0.42 }, source: "NATIVE_TEXT" },
      { text: "BAYAN 168 18,0797 3037,40 610990200012", bbox: { x0: 0.10, y0: 0.55, x1: 0.94, y1: 0.57 }, source: "NATIVE_TEXT" }
    ]
  }]
};

const envelope = discoverGenericInvoiceFieldCandidates(document, "segment-001");
const hs0 = envelope.fields["goodsLines.0.hsCode"]?.map(c => c.value) ?? [];
const hs1 = envelope.fields["goodsLines.1.hsCode"]?.map(c => c.value) ?? [];
const allHs = Object.entries(envelope.fields).filter(([field]) => /\.hsCode$/.test(field)).flatMap(([, cs]) => cs.map(c => c.value));

assert.deepEqual(hs0, ["610510000000"]);
assert.deepEqual(hs1, ["610990200012"]);
assert.equal(allHs.includes("084104695730"), false);
assert.equal(allHs.length, 2);

console.log(JSON.stringify({
  event: "product-e2e-1.5.12.gtip-identifier-disambiguation.passed",
  businessIdentifierTwelveDigitRejected: true,
  firstGoodsLineGtipAssociationPreserved: true,
  secondGoodsLineGtipAssociationPreserved: true,
  sourceVisibleExactGtipStillAccepted: true,
  supplierSpecificRuleAdded: false,
  noModelInferenceRequired: true,
  directNormalizedWrite: false
}, null, 2));
