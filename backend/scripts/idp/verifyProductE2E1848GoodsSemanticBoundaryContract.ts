import assert from "node:assert/strict";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { enforceVisionDocumentRoleAuthority, enforceVisionGoodsRowBoundary } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import type { CanonicalDocument, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const word = (text: string, x0: number, y0: number, x1: number, y1: number): CanonicalWord => ({
  text, bbox: { x0, y0, x1, y1 }, confidence: 1, source: "NATIVE_TEXT"
});
const page = (words: CanonicalWord[], lineTexts: Array<{ text: string; y0: number; y1: number }>): CanonicalPage => ({
  pageNumber: 1, width: 1000, height: 1000, rotation: 0,
  nativeText: lineTexts.map((line) => line.text).join("\n"), nativeCharCount: 1, nativeWordCount: words.length,
  hasNativeText: true, imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL", words,
  lines: lineTexts.map((line) => ({ text: line.text, bbox: { x0: 0, y0: line.y0, x1: 1, y1: line.y1 }, source: "NATIVE_TEXT" }))
});
const doc = (p: CanonicalPage): CanonicalDocument => ({
  schemaVersion: "1.0", source: {}, analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1 }, pages: [p]
});

// Generic table: the three values under the GTIP header are valid anchors. The
// 12-digit phone outside that semantic column must not become a fourth row.
const semanticPage = page([
  word("GTIP", .80, .10, .88, .12),
  word("761699909019", .80, .20, .90, .22),
  word("761699909019", .80, .30, .90, .32),
  word("761699909019", .80, .40, .90, .42),
  word("491622750606", .10, .70, .22, .72)
], [
  { text: "GTIP", y0: .10, y1: .12 },
  { text: "1 ITEM 761699909019", y0: .20, y1: .22 },
  { text: "2 ITEM 761699909019", y0: .30, y1: .32 },
  { text: "3 ITEM 761699909019", y0: .40, y1: .42 },
  { text: "TEL 491622750606", y0: .70, y1: .72 }
]);
const discovered = discoverGenericInvoiceFieldCandidates(doc(semanticPage), "segment-001");
const hsFields = Object.keys(discovered.fields).filter((field) => field.endsWith(".hsCode"));
assert.deepEqual(hsFields, ["goodsLines.0.hsCode", "goodsLines.1.hsCode", "goodsLines.2.hsCode"]);
assert.equal(Object.values(discovered.fields).flat().some((candidate) => candidate.value === "491622750606"), false);

// A 12-digit PAGE_IMAGE value on a page that only proves an 8-digit HSN must
// fail closed instead of borrowing the HSN label and becoming a fabricated GTIP.
const pmlPage = page([
  word("HSN", .70, .10, .76, .12), word("87089900", .70, .20, .78, .22), word("270326070477", .10, .80, .22, .82)
], [
  { text: "HSN", y0: .10, y1: .12 },
  { text: "87089900", y0: .20, y1: .22 },
  { text: "EPCG LUT 270326070477", y0: .80, y1: .82 }
]);
const imageEvidence = [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }];
const guarded = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  "goodsLines.0.hsCode": [{ candidateId: "vision:false-hs", field: "goodsLines.0.hsCode", value: "270326070477", confidence: 1, extractor: "vision", evidence: imageEvidence }]
}}, doc(pmlPage));
assert.equal(guarded.fields["goodsLines.0.hsCode"], undefined);

// Canonical native authority proves rows 0..2. A PAGE_IMAGE-only row 3 made
// from amount-in-words / package summary evidence must not be persisted.
const nativeAuthority: any = { version: "1", fields: Object.fromEntries([0, 1, 2].map((row) => [
  `goodsLines.${row}.hsCode`, [{ candidateId: `native:${row}`, field: `goodsLines.${row}.hsCode`, value: "761699909019", confidence: .98, extractor: "native", evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" }]}]
])) };
const withPhantom: any = { version: "1", fields: {
  ...nativeAuthority.fields,
  "goodsLines.3.description": [{ candidateId: "vision:phantom-desc", field: "goodsLines.3.description", value: "AMOUNT IN WORDS", confidence: 1, extractor: "vision", evidence: imageEvidence }],
  "goodsLines.3.quantity": [{ candidateId: "vision:phantom-qty", field: "goodsLines.3.quantity", value: 66, confidence: 1, extractor: "vision", evidence: imageEvidence }],
  "goodsLines.3.unit": [{ candidateId: "vision:phantom-unit", field: "goodsLines.3.unit", value: "PALET", confidence: 1, extractor: "vision", evidence: imageEvidence }]
}};
const bounded = enforceVisionGoodsRowBoundary(withPhantom, nativeAuthority);
assert.equal(Object.keys(bounded.fields).some((field) => field.startsWith("goodsLines.3.")), false);
assert.equal(Object.keys(bounded.fields).filter((field) => field.endsWith(".hsCode")).length, 3);

// No native rows means no destructive trimming: short-HSN invoices can still
// retain their legitimate Vision goods row while GTIP itself stays fail-closed.
const noNativeBoundary = enforceVisionGoodsRowBoundary(withPhantom, { version: "1", fields: {} });
assert.ok(noNativeBoundary.fields["goodsLines.3.description"]);

console.log(JSON.stringify({
  event: "product-e2e-1.8.48.goods-semantic-boundary.contract.passed",
  acceptance: {
    semanticGtipColumnPreserved: hsFields.length === 3,
    bareTwelveDigitPhoneRejected: true,
    epcgTwelveDigitRejectedAsGtip: true,
    pageImagePhantomFourthRowRejected: true,
    sourceUnprovenInvoicesNotDestructivelyTrimmed: true
  },
  guardrails: {
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    fixedColumnCoordinates: false,
    directNormalizedWrite: false,
    modelInferenceRequired: false
  }
}, null, 2));
