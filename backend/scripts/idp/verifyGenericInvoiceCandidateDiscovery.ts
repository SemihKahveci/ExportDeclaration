import assert from "node:assert/strict";
import type { CanonicalDocument, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";

function word(text: string, x0: number, x1: number, y0 = 0.40): CanonicalWord {
  return { text, bbox: { x0, y0, x1, y1: y0 + 0.012 }, confidence: 0.99, source: "NATIVE_TEXT" };
}

const document: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "headerless-columns.pdf", mimeType: "application/pdf" },
  analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1, ocrPageCount: 0, ocrWordCount: 0 },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0,
    nativeText: "A B C D E\n1 C25B4 SWITCH 15 PCS 853620900019 106,80 1.602,00",
    nativeCharCount: 70, nativeWordCount: 14, hasNativeText: true,
    imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
    words: [
      // Only five visible headers although the data row has eight logical columns.
      word("05-06-202609:05", .70, .82, .10),
      word("A", .05, .08, .20), word("B", .16, .19, .20), word("C", .30, .33, .20), word("D", .42, .45, .20), word("E", .52, .55, .20),
      word("1", .05, .07), word("C25B4", .12, .18), word("SWITCH", .23, .35),
      word("15", .43, .46), word("PCS", .48, .52),
      // No header exists over these three columns.
      word("853620900019", .60, .71), word("106,80", .75, .81), word("1.602,00", .86, .94)
    ],
    lines: []
  }]
};

const result = discoverGenericInvoiceFieldCandidates(document, "segment-001");
const f = result.fields;
assert.equal(f["goodsLines.0.hsCode"]?.[0]?.value, "853620900019");
assert.equal(Object.keys(f).filter((key) => key.endsWith(".hsCode")).length, 1);
assert.equal(f["goodsLines.0.quantity"]?.[0]?.value, 15);
assert.equal(f["goodsLines.0.unitPrice"]?.[0]?.value, 106.8);
assert.equal(f["goodsLines.0.lineTotal"]?.[0]?.value, 1602);
assert.equal(f["goodsLines.0.hsCode"]?.[0]?.evidence[0]?.text, "853620900019");
assert.equal(f["goodsLines.0.hsCode"]?.[0]?.extractor, "invoice-generic-layout-v5");


// OCR regression: values belonging to the same visual goods row may have visibly
// different baselines. Neighbouring HS anchors must partition the rows without
// relying on a wide fixed y tolerance.
function ocrWord(text: string, x0: number, x1: number, y0: number): CanonicalWord {
  return { text, bbox: { x0, y0, x1, y1: y0 + 0.009 }, confidence: 0.95, source: "OCR" };
}

const ocrDocument: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "ocr-baseline-drift.pdf", mimeType: "application/pdf" },
  analysis: { contentKind: "SCANNED", pageCount: 1, digitalPageCount: 0, scannedPageCount: 1, mixedPageCount: 0, nativeTextPageCount: 0, ocrPageCount: 1, ocrWordCount: 8 },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0,
    nativeText: "", nativeCharCount: 0, nativeWordCount: 0, hasNativeText: false,
    imageCount: 1, imageCoverage: 1, contentKind: "SCANNED", ocrApplied: true,
    words: [
      ocrWord("10", .42, .45, .286), ocrWord("25,00", .72, .78, .313), ocrWord("250,00 EUR", .82, .90, .320), ocrWord("853620900019", .91, .99, .300),
      ocrWord("4", .42, .44, .386), ocrWord("12,50", .72, .78, .414), ocrWord("%0,00 EUR50,00 EUR", .82, .89, .420), ocrWord("853890990000", .91, .99, .400)
    ],
    lines: []
  }]
};
const ocrResult = discoverGenericInvoiceFieldCandidates(ocrDocument, "segment-ocr");
assert.equal(ocrResult.fields["goodsLines.0.quantity"]?.[0]?.value, 10);
assert.equal(ocrResult.fields["goodsLines.0.unitPrice"]?.[0]?.value, 25);
assert.equal(ocrResult.fields["goodsLines.0.lineTotal"]?.[0]?.value, 250);
assert.equal(ocrResult.fields["goodsLines.1.quantity"]?.[0]?.value, 4);
assert.equal(ocrResult.fields["goodsLines.1.unitPrice"]?.[0]?.value, 12.5);
assert.equal(ocrResult.fields["goodsLines.1.lineTotal"]?.[0]?.value, 50);

// Precision regression: arithmetic validation may use currency rounding, but the
// selected candidate must preserve the precision of the source token.
const precisionDocument: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "source-precision.pdf", mimeType: "application/pdf" },
  analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1, ocrPageCount: 0, ocrWordCount: 0 },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0,
    nativeText: "5 39,0425 195,21 853620100011", nativeCharCount: 32, nativeWordCount: 4, hasNativeText: true,
    imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
    words: [word("5", .25, .28), word("39,0425", .32, .38), word("195,21", .59, .64), word("853620100011", .88, .98)],
    lines: []
  }]
};
const precisionResult = discoverGenericInvoiceFieldCandidates(precisionDocument, "segment-precision");
assert.equal(precisionResult.fields["goodsLines.0.quantity"]?.[0]?.value, 5);
assert.equal(precisionResult.fields["goodsLines.0.unitPrice"]?.[0]?.value, 39.0425);
assert.equal(precisionResult.fields["goodsLines.0.unitPrice"]?.[0]?.evidence[0]?.text, "39,0425");
assert.equal(precisionResult.fields["goodsLines.0.lineTotal"]?.[0]?.value, 195.21);

console.log(JSON.stringify({
  event: "idp.generic-invoice-candidate-discovery.regression.passed",
  headerCount: 5,
  logicalDataColumnCount: 8,
  discovered: {
    hsCode: f["goodsLines.0.hsCode"]?.[0]?.value,
    quantity: f["goodsLines.0.quantity"]?.[0]?.value,
    unitPrice: f["goodsLines.0.unitPrice"]?.[0]?.value,
    lineTotal: f["goodsLines.0.lineTotal"]?.[0]?.value
  },
  evidence: f["goodsLines.0.hsCode"]?.[0]?.evidence[0],
  ocrBaselineDrift: { rowsResolved: 2 },
  sourcePrecision: { unitPrice: precisionResult.fields["goodsLines.0.unitPrice"]?.[0]?.value }
}, null, 2));
