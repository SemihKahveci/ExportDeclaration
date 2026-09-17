import assert from "node:assert/strict";

import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";

const canonical: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "fixture.pdf", mimeType: "application/pdf" },
  analysis: {
    contentKind: "DIGITAL",
    pageCount: 1,
    digitalPageCount: 1,
    scannedPageCount: 0,
    mixedPageCount: 0,
    nativeTextPageCount: 1,
    ocrPageCount: 0,
    ocrWordCount: 0
  },
  pages: [{
    pageNumber: 1,
    width: 595,
    height: 842,
    rotation: 0,
    nativeText: "850440959019 ABC123 2 ADET 10,00 20,00",
    nativeCharCount: 40,
    nativeWordCount: 6,
    hasNativeText: true,
    imageCount: 0,
    imageCoverage: 0,
    contentKind: "DIGITAL",
    words: [
      { text: "850440959019", bbox: { x0: 0.10, y0: 0.20, x1: 0.18, y1: 0.22 }, confidence: 1, source: "NATIVE_TEXT" },
      { text: "ABC123", bbox: { x0: 0.20, y0: 0.20, x1: 0.27, y1: 0.22 }, confidence: 1, source: "NATIVE_TEXT" },
      { text: "2", bbox: { x0: 0.50, y0: 0.20, x1: 0.51, y1: 0.22 }, confidence: 1, source: "NATIVE_TEXT" },
      { text: "10,00", bbox: { x0: 0.65, y0: 0.20, x1: 0.70, y1: 0.22 }, confidence: 1, source: "NATIVE_TEXT" },
      { text: "20,00", bbox: { x0: 0.80, y0: 0.20, x1: 0.85, y1: 0.22 }, confidence: 1, source: "NATIVE_TEXT" }
    ],
    lines: []
  }]
};

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [x0 * 1700, y0 * 2500, x1 * 1700, y1 * 2500];

const data: Record<string, unknown> = {
  goodsLines: [{
    lineNo: 1,
    hsCode: "850440959019",
    productCode: "ABC123",
    description: "POWER SUPPLY",
    quantity: 2,
    unit: "ADET",
    unitPrice: 10,
    lineTotal: 20
  }],
  extractMeta: {
    rawItems: [{
      lineNo: 1,
      gtip: "850440959019",
      productCode: "ABC123",
      description: "POWER SUPPLY",
      quantity: "2",
      unit: "ADET",
      unitPrice: "10,00",
      amount: "20,00",
      source: { page: 1 },
      boxes: {
        gtip: box(0.10, 0.20, 0.18, 0.22),
        productCode: box(0.20, 0.20, 0.27, 0.22),
        quantity: box(0.50, 0.20, 0.51, 0.22),
        unitPrice: box(0.65, 0.20, 0.70, 0.22),
        amount: box(0.80, 0.20, 0.85, 0.22)
      }
    }]
  }
};

const result = buildInvoiceFieldCandidates(data, canonical, "segment-001");
const hs = result.fields["goodsLines.0.hsCode"]?.[0];
const amount = result.fields["goodsLines.0.lineTotal"]?.[0];
const description = result.fields["goodsLines.0.description"]?.[0];
const unit = result.fields["goodsLines.0.unit"]?.[0];

assert.equal(result.version, "1");
assert.equal(hs?.value, "850440959019");
assert.equal(hs?.evidence[0]?.segmentId, "segment-001");
assert.equal(hs?.evidence[0]?.pageNumber, 1);
assert.equal(hs?.evidence[0]?.contentSource, "NATIVE_TEXT");
assert.ok(Math.abs((hs?.evidence[0]?.bbox?.x0 ?? 0) - 0.10) < 0.000001);
assert.equal(hs?.evidence[0]?.text, "850440959019");

assert.equal(amount?.value, 20);
assert.equal(amount?.evidence[0]?.text, "20,00");
assert.equal(description?.evidence[0]?.bbox, undefined);
assert.equal(unit?.derived, true);
assert.equal(unit?.evidence[0]?.contentSource, "DERIVED");

console.log(JSON.stringify({
  event: "idp.field-candidate-evidence.regression.passed",
  fieldCount: Object.keys(result.fields).length,
  hsCode: {
    value: hs?.value,
    pageNumber: hs?.evidence[0]?.pageNumber,
    bbox: hs?.evidence[0]?.bbox,
    text: hs?.evidence[0]?.text
  },
  amount: {
    value: amount?.value,
    text: amount?.evidence[0]?.text
  },
  derivedUnit: unit?.derived
}, null, 2));
