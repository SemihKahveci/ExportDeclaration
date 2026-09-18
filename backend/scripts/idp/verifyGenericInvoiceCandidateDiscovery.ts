import assert from "node:assert/strict";
import type { CanonicalDocument, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";

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
assert.ok(f["goodsLines.0.productCode"]?.some((item) => item.value === "C25B4"));
assert.equal(f["goodsLines.0.unit"]?.[0]?.value, "PCS");
assert.equal(f["goodsLines.0.description"]?.[0]?.value, "SWITCH");
assert.equal(f["goodsLines.0.hsCode"]?.[0]?.evidence[0]?.text, "853620900019");
assert.equal(f["goodsLines.0.hsCode"]?.[0]?.extractor, "invoice-generic-layout-v14");


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

// Semantic-row regression: continuation lines after an HS anchor belong to that
// logical goods row, not to the next anchor. OCR punctuation variants of a
// namespaced ERP code must remain discoverable without supplier-prefix rules.
const semanticDocument: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "semantic-continuation.pdf", mimeType: "application/pdf" },
  analysis: { contentKind: "SCANNED", pageCount: 1, digitalPageCount: 0, scannedPageCount: 1, mixedPageCount: 0, nativeTextPageCount: 0, ocrPageCount: 1, ocrWordCount: 20 },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0,
    nativeText: "", nativeCharCount: 0, nativeWordCount: 0, hasNativeText: false,
    imageCount: 1, imageCoverage: 1, contentKind: "SCANNED", ocrApplied: true,
    words: [
      ocrWord("1", .06, .08, .300), ocrWord("AG,EAT.216384", .09, .17, .300), ocrWord("MOROCCO", .18, .24, .300),
      ocrWord("180", .25, .28, .300), ocrWord("Adet", .247, .275, .310), ocrWord("1,4900", .29, .33, .300),
      ocrWord("268,20 EUR", .49, .55, .300), ocrWord("Karayolu853890990000", .79, .92, .300),
      ocrWord("M22-CK10", .09, .15, .311), ocrWord("YARDIMCI", .09, .15, .322), ocrWord("KONTAK 1NA", .09, .16, .333), ocrWord("(YAYLI TERMINAL)", .09, .18, .344),
      ocrWord("2", .06, .08, .360), ocrWord("AG,EAT.216385", .09, .17, .360), ocrWord("260", .25, .28, .360),
      ocrWord("1,4900", .29, .33, .360), ocrWord("387,40 EUR", .49, .55, .360), ocrWord("853890990000", .84, .92, .360),
      ocrWord("M22-CK01", .09, .15, .371), ocrWord("NEXT DESCRIPTION", .09, .20, .382)
    ],
    lines: []
  }]
};
const semanticResult = discoverGenericInvoiceFieldCandidates(semanticDocument, "segment-semantic");
assert.ok(semanticResult.fields["goodsLines.0.productCode"]?.some(item => item.value === "EAT.216384"));
assert.ok(semanticResult.fields["goodsLines.0.productCode"]?.some(item => item.value === "216384"));
assert.ok(semanticResult.fields["goodsLines.1.productCode"]?.some(item => item.value === "EAT.216385"));
assert.ok(semanticResult.fields["goodsLines.1.productCode"]?.some(item => item.value === "216385"));
const semanticDescription0 = String(semanticResult.fields["goodsLines.0.description"]?.[0]?.value ?? "");
const semanticDescription1 = String(semanticResult.fields["goodsLines.1.description"]?.[0]?.value ?? "");
assert.match(semanticDescription0, /M22-CK10/);
assert.match(semanticDescription0, /YARDIMCI/);
assert.match(semanticDescription0, /YAYLI TERMINAL/);
assert.doesNotMatch(semanticDescription0, /216385/);
assert.match(semanticDescription1, /M22-CK01/);
assert.doesNotMatch(semanticDescription1, /216384/);
assert.doesNotMatch(semanticDescription0, /MOROCCO/);


// Wide-continuation regression: semantic description lines may extend farther
// right than the product-code token. They still belong to the same logical
// description band and must not be clipped to the code token width.
const wideContinuationDocument: CanonicalDocument = {
  schemaVersion: "1.0",
  source: { fileName: "wide-semantic-continuation.pdf", mimeType: "application/pdf" },
  analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1, ocrPageCount: 0, ocrWordCount: 0 },
  pages: [{
    pageNumber: 1, width: 1000, height: 1400, rotation: 0, nativeText: "", nativeCharCount: 0, nativeWordCount: 0, hasNativeText: true,
    imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
    words: [
      word("4", .03, .05, .400), word("AG.SCH.C25B4", .065, .145, .400), word("POLAND", .198, .240, .400),
      word("4", .269, .278, .400), word("Adet", .280, .305, .400), word("106,8000", .318, .360, .400),
      word("427,20", .592, .630, .400), word("853620900019", .889, .980, .400),
      word("C25B4", .065, .103, .412), word("BASIC", .106, .143, .412), word("FRAME", .146, .184, .412),
      word("NSX250B", .061, .113, .424), word("25kA", .118, .148, .424), word("AC", .151, .168, .424), word("4P", .171, .187, .424),
      word("250A", .061, .095, .436)
    ],
    lines: []
  }]
};
const wideContinuationResult = discoverGenericInvoiceFieldCandidates(wideContinuationDocument, "segment-wide");
const wideDescription = String(wideContinuationResult.fields["goodsLines.0.description"]?.[0]?.value ?? "");
assert.match(wideDescription, /BASIC/);
assert.match(wideDescription, /FRAME/);
assert.match(wideDescription, /NSX250B/);
assert.match(wideDescription, /25kA/);
assert.match(wideDescription, /4P/);
assert.match(wideDescription, /250A/);
assert.doesNotMatch(wideDescription, /POLAND/);

console.log(JSON.stringify({
  event: "idp.generic-invoice-candidate-discovery.regression.passed",
  headerCount: 5,
  logicalDataColumnCount: 8,
  discovered: {
    hsCode: f["goodsLines.0.hsCode"]?.[0]?.value,
    quantity: f["goodsLines.0.quantity"]?.[0]?.value,
    unitPrice: f["goodsLines.0.unitPrice"]?.[0]?.value,
    lineTotal: f["goodsLines.0.lineTotal"]?.[0]?.value,
    productCodeCandidates: f["goodsLines.0.productCode"]?.map((item) => item.value),
    unit: f["goodsLines.0.unit"]?.[0]?.value,
    description: f["goodsLines.0.description"]?.[0]?.value
  },
  evidence: f["goodsLines.0.hsCode"]?.[0]?.evidence[0],
  ocrBaselineDrift: { rowsResolved: 2 },
  sourcePrecision: { unitPrice: precisionResult.fields["goodsLines.0.unitPrice"]?.[0]?.value },
  semanticContinuation: {
    firstRowProductCodeCandidates: semanticResult.fields["goodsLines.0.productCode"]?.map(item => item.value),
    firstRowDescription: semanticDescription0,
    secondRowDescription: semanticDescription1
  }
}, null, 2));

// Canonical-evidence gate: discovery is only production-eligible when every
// structured value is traceable to canonical words and arithmetic reconciles.
const evidenceValidation = validateGenericInvoiceEvidence(document, result);
assert.equal(evidenceValidation.status, "VALID");
assert.equal(evidenceValidation.summary.reviewRequiredRowCount, 0);

const tampered = structuredClone(result);
tampered.fields["goodsLines.0.productCode"]![0]!.derived = true;
tampered.fields["goodsLines.0.productCode"]![0]!.value = "INVENTED999";
const tamperedValidation = validateGenericInvoiceEvidence(document, tampered);
assert.equal(tamperedValidation.status, "REVIEW_REQUIRED");
assert.ok(tamperedValidation.rows[0]?.issues.some(issue => issue.code === "DERIVED_PRODUCT_CODE_NOT_TRACEABLE"));

const arithmeticTampered = structuredClone(result);
arithmeticTampered.fields["goodsLines.0.lineTotal"]![0]!.value = 9999;
const arithmeticValidation = validateGenericInvoiceEvidence(document, arithmeticTampered);
assert.ok(arithmeticValidation.rows[0]?.issues.some(issue => issue.code === "ARITHMETIC_MISMATCH"));

console.log(JSON.stringify({
  event: "idp.generic-invoice-evidence-validation.regression.passed",
  validation: evidenceValidation.summary,
  negativeCases: {
    inventedDerivedProductCode: tamperedValidation.status,
    arithmeticMismatch: arithmeticValidation.status
  }
}, null, 2));
