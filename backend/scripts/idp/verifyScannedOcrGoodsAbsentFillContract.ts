/**
 * SCANNED OCR absent-fill: fill Vision-empty goods cells by HS match.
 * DIGITAL no-op; never overwrite; never invent unmatched rows.
 */
import assert from "node:assert/strict";
import { discoverValidatedOcrGoodsAbsentFill } from "../../src/modules/idp/candidates/invoiceScannedOcrGoodsAbsentFill.js";
import type { CanonicalDocument, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

function ocrWord(text: string, x0: number, x1: number, y0: number): CanonicalWord {
  return { text, bbox: { x0, y0, x1, y1: y0 + 0.009 }, confidence: 0.95, source: "OCR" };
}

function nativeWord(text: string, x0: number, x1: number, y0: number): CanonicalWord {
  return { text, bbox: { x0, y0, x1, y1: y0 + 0.009 }, confidence: 0.99, source: "NATIVE_TEXT" };
}

const scannedCanonical: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "scanned-absent-fill.pdf", mimeType: "application/pdf" },
  analysis: {
    contentKind: "SCANNED", pageCount: 1, digitalPageCount: 0, scannedPageCount: 1,
    mixedPageCount: 0, nativeTextPageCount: 0, ocrPageCount: 1, ocrWordCount: 8,
  },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0,
    nativeText: "", nativeCharCount: 0, nativeWordCount: 0, hasNativeText: false,
    imageCount: 1, imageCoverage: 1, contentKind: "SCANNED", ocrApplied: true,
    words: [
      ocrWord("10", 0.42, 0.45, 0.286),
      ocrWord("25,00", 0.72, 0.78, 0.313),
      ocrWord("250,00 EUR", 0.82, 0.90, 0.320),
      ocrWord("853620900019", 0.91, 0.99, 0.300),
      ocrWord("4", 0.42, 0.44, 0.386),
      ocrWord("12,50", 0.72, 0.78, 0.414),
      ocrWord("50,00 EUR", 0.82, 0.89, 0.420),
      ocrWord("853890990000", 0.91, 0.99, 0.400),
    ],
    lines: [],
  }],
};

function vision(fields: FieldCandidateEnvelope["fields"]): FieldCandidateEnvelope {
  return { version: "1", fields };
}

function vc(field: string, value: unknown) {
  return [{
    candidateId: field,
    field,
    value,
    confidence: 0.9,
    extractor: "vision",
    evidence: [{ segmentId: "seg", pageNumber: 1, text: String(value), contentSource: "PAGE_IMAGE" as const }],
  }];
}

// Vision has HS + description but missing qty/price/total → OCR fills them.
const sparseVision = vision({
  "goodsLines.0.hsCode": vc("goodsLines.0.hsCode", "853620900019"),
  "goodsLines.0.description": vc("goodsLines.0.description", "SWITCH"),
  "goodsLines.1.hsCode": vc("goodsLines.1.hsCode", "853890990000"),
  "goodsLines.1.description": vc("goodsLines.1.description", "PART"),
});
const filled = discoverValidatedOcrGoodsAbsentFill(scannedCanonical, "seg", sparseVision);
assert.equal(filled.fields["goodsLines.0.quantity"]?.[0]?.value, 10);
assert.equal(filled.fields["goodsLines.0.unitPrice"]?.[0]?.value, 25);
assert.equal(filled.fields["goodsLines.0.lineTotal"]?.[0]?.value, 250);
assert.equal(filled.fields["goodsLines.1.quantity"]?.[0]?.value, 4);
assert.equal(filled.fields["goodsLines.1.unitPrice"]?.[0]?.value, 12.5);
assert.equal(filled.fields["goodsLines.1.lineTotal"]?.[0]?.value, 50);
assert.ok(String(filled.fields["goodsLines.0.quantity"]?.[0]?.candidateId).includes("ocr-absent-fill"));
assert.ok(!String(filled.fields["goodsLines.0.quantity"]?.[0]?.candidateId).includes("f6-native-row"));

// Vision already has quantity → do not overwrite.
const withQty = vision({
  "goodsLines.0.hsCode": vc("goodsLines.0.hsCode", "853620900019"),
  "goodsLines.0.quantity": vc("goodsLines.0.quantity", 99),
});
const noOverwrite = discoverValidatedOcrGoodsAbsentFill(scannedCanonical, "seg", withQty);
assert.equal(noOverwrite.fields["goodsLines.0.quantity"], undefined);
assert.equal(noOverwrite.fields["goodsLines.0.unitPrice"]?.[0]?.value, 25);

// Unmatched HS → invent no row.
const unmatched = vision({
  "goodsLines.0.hsCode": vc("goodsLines.0.hsCode", "999999999999"),
  "goodsLines.0.description": vc("goodsLines.0.description", "OTHER"),
});
assert.equal(Object.keys(discoverValidatedOcrGoodsAbsentFill(scannedCanonical, "seg", unmatched).fields).length, 0);

// DIGITAL document → hard no-op even with similar layout.
const digitalCanonical: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "digital-no-ocr-fill.pdf", mimeType: "application/pdf" },
  analysis: {
    contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0,
    mixedPageCount: 0, nativeTextPageCount: 1, ocrPageCount: 0, ocrWordCount: 0,
  },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0,
    nativeText: "10 25,00 250,00 853620900019",
    nativeCharCount: 20, nativeWordCount: 4, hasNativeText: true,
    imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
    words: [
      nativeWord("10", 0.42, 0.45, 0.286),
      nativeWord("25,00", 0.72, 0.78, 0.313),
      nativeWord("250,00", 0.82, 0.90, 0.320),
      nativeWord("853620900019", 0.91, 0.99, 0.300),
    ],
    lines: [],
  }],
};
assert.equal(
  Object.keys(discoverValidatedOcrGoodsAbsentFill(digitalCanonical, "seg", sparseVision).fields).length,
  0,
);

console.log(JSON.stringify({
  event: "scanned-ocr-goods-absent-fill.contract.passed",
  guardrails: {
    scannedAbsentFillByHs: true,
    visionValueNotOverwritten: true,
    unmatchedHsDoesNotInventRow: true,
    digitalDocumentNoOp: true,
    nativeRowAuthorityIdNotUsed: true,
    supplierSpecificRules: false,
  },
}, null, 2));
