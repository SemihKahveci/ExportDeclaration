import assert from "node:assert/strict";
import { goodsLineTotalRecoveryBlocked } from "../../src/modules/idp/llm/invoiceAdaptiveRecoveryExecution.js";
import {
  applyNativeGoodsCellBinding,
  bindNativeGoodsCells
} from "../../src/modules/idp/candidates/invoiceNativeCellBinding.js";
import type { CanonicalDocument, CanonicalPage, CanonicalWord, PdfContentKind } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

function word(text: string, x0: number, y0: number, source: CanonicalWord["source"] = "NATIVE_TEXT"): CanonicalWord {
  return { text, bbox: { x0, y0, x1: x0 + 0.08, y1: y0 + 0.015 }, confidence: 1, source };
}

function placed(text: string, x0: number, x1: number, y: number): CanonicalWord {
  return { text, bbox: { x0, y0: y - 0.006, x1, y1: y + 0.006 }, confidence: 1, source: "NATIVE_TEXT" };
}

function page(pageNumber: number, kind: PdfContentKind, words: CanonicalWord[]): CanonicalPage {
  return {
    pageNumber,
    width: 1,
    height: 1,
    rotation: 0,
    nativeText: words.map((item) => item.text).join(" "),
    nativeCharCount: 20,
    nativeWordCount: words.length,
    hasNativeText: kind !== "SCANNED",
    imageCount: 0,
    imageCoverage: 0,
    contentKind: kind,
    words,
    lines: []
  };
}

function document(pages: CanonicalPage[]): CanonicalDocument {
  return {
    schemaVersion: "1.0",
    source: { fileName: "native-cell.pdf" },
    analysis: {
      contentKind: pages.every((item) => item.contentKind === "DIGITAL") ? "DIGITAL" : "MIXED",
      pageCount: pages.length,
      digitalPageCount: pages.filter((item) => item.contentKind === "DIGITAL").length,
      scannedPageCount: pages.filter((item) => item.contentKind === "SCANNED").length,
      mixedPageCount: 0,
      nativeTextPageCount: pages.filter((item) => item.hasNativeText).length
    },
    pages
  };
}

function candidate(field: string, value: unknown) {
  return [{
    candidateId: field,
    field,
    value,
    confidence: 0.9,
    extractor: "vision",
    evidence: [{ segmentId: "seg", pageNumber: 1, text: String(value), contentSource: "PAGE_IMAGE" as const }]
  }];
}

function goods(fields: FieldCandidateEnvelope["fields"]): FieldCandidateEnvelope {
  return { version: "1", fields };
}

const headers = [
  word("Kod", 0.05, 0.2),
  word("Koli", 0.25, 0.2),
  word("Miktar", 0.45, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("Tutar", 0.8, 0.2)
];

const commercial = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...headers,
  word("AG.SCH.C25B4", 0.05, 0.4),
  word("2", 0.25, 0.4),
  word("25000", 0.45, 0.4),
  word("0.70", 0.62, 0.4),
  word("17500", 0.8, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C25B4"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 0.7),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 875)
}));
assert.equal(commercial.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 25000);
assert.equal(commercial.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 17500);
assert.equal(commercial.replacements.fields["goodsLines.0.unitPrice"], undefined);
assert.equal(commercial.conflicts.fields["goodsLines.0.quantity"], undefined);

const applied = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C25B4"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 875)
}), commercial);
assert.equal(applied.fields["goodsLines.0.quantity"]?.[0]?.value, 25000);
assert.equal(applied.fields["goodsLines.0.quantity"]?.length, 1);

const locale = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.58, 0.2),
  word("Tutar", 0.76, 0.2),
  word("ROW-1", 0.05, 0.4),
  word("1", 0.4, 0.4),
  word("29.57", 0.58, 0.4),
  word("29,5700", 0.76, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "ROW-1"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 29.57),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 295700)
}));
assert.equal(locale.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 29.57);

const ambiguousCell = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Tutar", 0.7, 0.2),
  word("ROW-2", 0.05, 0.4),
  word("1", 0.4, 0.4),
  word("29,5700", 0.7, 0.4),
  word("30", 0.78, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "ROW-2"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 295700)
}));
assert.equal(ambiguousCell.replacements.fields["goodsLines.0.lineTotal"], undefined);
assert.equal(ambiguousCell.conflicts.fields["goodsLines.0.lineTotal"]?.length, 2);

const scanned = bindNativeGoodsCells(document([page(1, "SCANNED", [
  ...headers.map((item) => word(item.text, item.bbox.x0, item.bbox.y0, "OCR")),
  word("AG.SCH.C25B4", 0.05, 0.4, "OCR"),
  word("25000", 0.45, 0.4, "OCR")
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C25B4"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2)
}));
assert.deepEqual(scanned.replacements.fields, {});
assert.deepEqual(scanned.conflicts.fields, {});

const noHeader = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("AG.SCH.C25B4", 0.05, 0.4),
  word("25000", 0.45, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C25B4"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2)
}));
assert.deepEqual(noHeader.replacements.fields, {});

const consistentWrongTriple = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.58, 0.2),
  word("Tutar", 0.76, 0.2),
  word("YEM-1", 0.05, 0.4),
  word("1250", 0.4, 0.4),
  word("0.70", 0.58, 0.4),
  word("875", 0.76, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "YEM-1"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1250),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 0.7),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 875)
}));
assert.equal(consistentWrongTriple.replacements.fields["goodsLines.0.quantity"], undefined);
assert.equal(consistentWrongTriple.replacements.fields["goodsLines.0.lineTotal"], undefined);

const continuation = bindNativeGoodsCells(document([
  page(1, "DIGITAL", [
    word("Kod", 0.05, 0.2),
    word("Miktar", 0.45, 0.2),
    word("Tutar", 0.7, 0.2),
    word("AG.SCH.C10H3", 0.05, 0.4),
    word("3", 0.45, 0.4),
    word("221.13", 0.7, 0.4)
  ]),
  page(2, "DIGITAL", [
    word("Kod", 0.05, 0.2),
    word("Miktar", 0.45, 0.2),
    word("Tutar", 0.7, 0.2),
    word("AG.SCH.C10H3", 0.05, 0.4),
    word("5", 0.45, 0.4),
    word("368.55", 0.7, 0.4)
  ])
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C10H3"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 1),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.C10H3"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.lineTotal": candidate("goodsLines.1.lineTotal", 1)
}));
assert.equal(continuation.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 3);
assert.equal(continuation.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 221.13);
assert.equal(continuation.replacements.fields["goodsLines.1.quantity"]?.[0]?.value, 5);
assert.equal(continuation.replacements.fields["goodsLines.1.lineTotal"]?.[0]?.value, 368.55);

const nativeGrounded = goods({
  "goodsLines.0.lineTotal": [{
    candidateId: "native",
    field: "goodsLines.0.lineTotal",
    value: 29.57,
    confidence: 0.98,
    extractor: "invoice-native-cell-binding-v1",
    evidence: [{ segmentId: "seg", pageNumber: 1, contentSource: "NATIVE_TEXT" }]
  }]
});
assert.equal(goodsLineTotalRecoveryBlocked(nativeGrounded, "goodsLines.0.lineTotal"), true);
assert.equal(goodsLineTotalRecoveryBlocked(goods({
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 29.57),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 29.57)
}), "goodsLines.0.lineTotal"), true);
assert.equal(goodsLineTotalRecoveryBlocked(goods({
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 29.57),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 295700)
}), "goodsLines.0.lineTotal"), false);

const efatura = bindNativeGoodsCells(document([
  page(1, "DIGITAL", [
    word("Malzeme/Hizmet", 0.05, 0.26),
    word("Kodu", 0.07, 0.28),
    word("Miktar", 0.28, 0.275),
    word("Birim", 0.4, 0.27),
    word("Fiyat", 0.4, 0.29),
    word("İskonto", 0.52, 0.27),
    word("Tutarı", 0.52, 0.29),
    word("Hizmet", 0.68, 0.27),
    word("Tutarı", 0.68, 0.29),
    word("GTİP", 0.86, 0.28),
    word("AG.SCH.C25B4", 0.05, 0.34),
    word("15", 0.28, 0.34),
    word("106,8000", 0.4, 0.34),
    word("1.602,00", 0.68, 0.34),
    word("853620900019", 0.86, 0.34),
    word("C25B4", 0.05, 0.352),
    word("FRAME", 0.12, 0.352)
  ]),
  page(2, "DIGITAL", [
    word("AG.SCH.C10H3", 0.05, 0.12),
    word("5", 0.28, 0.12),
    word("73,7100", 0.4, 0.12),
    word("368,55", 0.68, 0.12)
  ])
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C25B4"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 106800),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 160200),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.C10H3"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 1),
  "goodsLines.1.lineTotal": candidate("goodsLines.1.lineTotal", 1)
}));
assert.equal(efatura.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 15);
assert.equal(efatura.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 106.8);
assert.equal(efatura.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 1602);
assert.equal(efatura.replacements.fields["goodsLines.0.hsCode"]?.[0]?.value, "853620900019");
assert.equal(efatura.replacements.fields["goodsLines.0.description"]?.[0]?.value, "C25B4 FRAME");
assert.equal(efatura.replacements.fields["goodsLines.1.quantity"]?.[0]?.value, 5);
assert.equal(efatura.replacements.fields["goodsLines.1.unitPrice"]?.[0]?.value, 73.71);
assert.equal(efatura.replacements.fields["goodsLines.1.lineTotal"]?.[0]?.value, 368.55);

const gluedAmount = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kodu", 0.08, 0.28),
  word("Miktar", 0.32, 0.28),
  word("Fiyat", 0.5, 0.28),
  word("Tutar", 0.7, 0.28),
  word("AG.SCH.50439", 0.08, 0.4),
  word("80", 0.16, 0.4),
  word("20Adet", 0.32, 0.4),
  word("41,2500EUR", 0.5, 0.4),
  word("825,00EUR", 0.7, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.50439"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 80),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 412500),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 825000)
}));
assert.equal(gluedAmount.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 20);
assert.equal(gluedAmount.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 41.25);
assert.equal(gluedAmount.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 825);
assert.equal(gluedAmount.replacements.fields["goodsLines.0.unit"]?.[0]?.value, "ADET");
assert.equal(gluedAmount.conflicts.fields["goodsLines.0.quantity"], undefined);

const neighborColumn = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  placed("Kodu", 0.138, 0.167, 0.342),
  placed("Açıklaması", 0.23, 0.288, 0.342),
  placed("Açıklaması", 0.308, 0.366, 0.342),
  placed("Miktar", 0.374, 0.41, 0.337),
  placed("Birim", 0.431, 0.459, 0.337),
  placed("Fiyat", 0.463, 0.489, 0.337),
  placed("Hizmet", 0.52, 0.558, 0.337),
  placed("Tutarı", 0.523, 0.556, 0.347),
  placed("GTİP", 0.856, 0.881, 0.337),
  placed("AG.SCH.50439", 0.1, 0.175, 0.36),
  placed("80", 0.266, 0.279, 0.36),
  placed("FRANCE", 0.312, 0.351, 0.36),
  placed("20Adet", 0.374, 0.411, 0.36),
  placed("41,2500EUR", 0.439, 0.502, 0.36),
  placed("825,00EUR", 0.514, 0.571, 0.36)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.50439"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 80),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 412500),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 825000)
}));
assert.equal(neighborColumn.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 20);
assert.equal(neighborColumn.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 41.25);
assert.equal(neighborColumn.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 825);
assert.equal(neighborColumn.conflicts.fields["goodsLines.0.quantity"], undefined);
assert.equal(neighborColumn.conflicts.fields["goodsLines.0.unitPrice"], undefined);

const swappedCode = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F94440", 0.08, 0.4),
  word("37Adet", 0.4, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.216592"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 37)
}));
assert.equal(swappedCode.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9F94440");
assert.equal(swappedCode.replacements.fields["goodsLines.0.quantity"], undefined);

const unevenRows = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.ONLY", 0.08, 0.4),
  word("20Adet", 0.4, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OTHER-1"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "OTHER-2"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1)
}));
assert.equal(unevenRows.replacements.fields["goodsLines.0.productCode"], undefined);
assert.equal(unevenRows.replacements.fields["goodsLines.0.quantity"], undefined);

const crossPageCodes = bindNativeGoodsCells(document([
  page(1, "DIGITAL", [
    word("Kod", 0.08, 0.2),
    word("Miktar", 0.4, 0.2),
    word("Fiyat", 0.62, 0.2),
    word("AG.SCH.A9F94440", 0.08, 0.4),
    word("37Adet", 0.4, 0.4),
    word("34,5660EUR", 0.62, 0.4),
    word("AG.SCH.BBBB2222", 0.08, 0.48),
    word("10Adet", 0.4, 0.48),
    word("1,5000EUR", 0.62, 0.48)
  ]),
  page(2, "DIGITAL", [
    word("AG.EAT.216592", 0.08, 0.3),
    word("5Adet", 0.4, 0.3),
    word("1,3180EUR", 0.62, 0.3),
    word("3KONUMLU", 0.16, 0.34),
    word("AG.EAT.216596", 0.08, 0.38),
    word("82Adet", 0.4, 0.38),
    word("1,3180EUR", 0.62, 0.38)
  ])
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.216592"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 37),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 34.566),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.BBBB2222"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 10),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 1.5),
  "goodsLines.2.productCode": candidate("goodsLines.2.productCode", "AG.EAT.216592"),
  "goodsLines.2.quantity": candidate("goodsLines.2.quantity", 5),
  "goodsLines.2.unitPrice": candidate("goodsLines.2.unitPrice", 1.318),
  "goodsLines.3.productCode": candidate("goodsLines.3.productCode", "AG.EAT.216596"),
  "goodsLines.3.quantity": candidate("goodsLines.3.quantity", 82),
  "goodsLines.3.unitPrice": candidate("goodsLines.3.unitPrice", 1.318)
}));
assert.equal(crossPageCodes.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9F94440");
assert.equal(crossPageCodes.replacements.fields["goodsLines.0.quantity"], undefined);
assert.equal(crossPageCodes.replacements.fields["goodsLines.0.unitPrice"], undefined);
assert.equal(crossPageCodes.replacements.fields["goodsLines.1.productCode"], undefined);
assert.equal(crossPageCodes.replacements.fields["goodsLines.2.productCode"], undefined);
assert.equal(crossPageCodes.conflicts.fields["goodsLines.0.quantity"], undefined);

const shiftedNumbers = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F74402", 0.08, 0.4),
  word("6Adet", 0.4, 0.4),
  word("21,6400EUR", 0.62, 0.4),
  word("AG.SCH.A9F74202", 0.08, 0.48),
  word("48Adet", 0.4, 0.48),
  word("10,6600EUR", 0.62, 0.48)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "A9F74202"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 48),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 10.66),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.A9F74402"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 6),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 21.64)
}));
assert.equal(shiftedNumbers.replacements.fields["goodsLines.0.quantity"], undefined);
assert.equal(shiftedNumbers.replacements.fields["goodsLines.0.unitPrice"], undefined);
assert.equal(shiftedNumbers.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9F74202");

const disagreeingOrder = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F74402", 0.08, 0.4),
  word("6Adet", 0.4, 0.4),
  word("21,6400EUR", 0.62, 0.4),
  word("AG.SCH.OTHER", 0.08, 0.48),
  word("48Adet", 0.4, 0.48),
  word("10,6600EUR", 0.62, 0.48)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F74202"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 48),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 10.66),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.A9F74402"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 6),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 21.64)
}));
assert.equal(disagreeingOrder.replacements.fields["goodsLines.0.quantity"], undefined);
assert.equal(disagreeingOrder.replacements.fields["goodsLines.0.productCode"], undefined);

const duplicateDisplaced = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F74402", 0.08, 0.4),
  word("6Adet", 0.4, 0.4),
  word("21,6400EUR", 0.62, 0.4),
  word("AG.SCH.A9F74202", 0.08, 0.48),
  word("48Adet", 0.4, 0.48),
  word("10,6600EUR", 0.62, 0.48)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F74202"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 48),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 10.66),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.A9F74202"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 48),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10.66)
}));
assert.equal(duplicateDisplaced.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9F74402");
assert.equal(duplicateDisplaced.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 6);
assert.equal(duplicateDisplaced.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 21.64);
assert.equal(duplicateDisplaced.replacements.fields["goodsLines.1.quantity"], undefined);
assert.equal(duplicateDisplaced.replacements.fields["goodsLines.1.productCode"], undefined);

const splitCodeDuplicate = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F74402", 0.08, 0.4),
  word("6Adet", 0.4, 0.4),
  word("21,6400EUR", 0.62, 0.4),
  word("AG.SCH.A9F74202", 0.08, 0.48),
  word("48Adet", 0.4, 0.48),
  word("10,6600EUR", 0.62, 0.48)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "A9F74202"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 48),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 10.66),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.A9F74202"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 48),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10.66)
}));
assert.equal(splitCodeDuplicate.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9F74402");
assert.equal(splitCodeDuplicate.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 6);
assert.equal(splitCodeDuplicate.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 21.64);
assert.equal(splitCodeDuplicate.replacements.fields["goodsLines.1.quantity"], undefined);

const displacedOntoFirstCopy = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.C125N320FM", 0.08, 0.4),
  word("1Adet", 0.4, 0.4),
  word("961,4400EUR", 0.62, 0.4),
  word("AG.EAT.41097", 0.08, 0.48),
  word("60Adet", 0.4, 0.48),
  word("12,3000EUR", 0.62, 0.48),
  word("AG.EAT.41097", 0.08, 0.56),
  word("20Adet", 0.4, 0.56),
  word("12,3000EUR", 0.62, 0.56)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.41097"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 961.44),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.EAT.216887"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 60),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 12.3),
  "goodsLines.2.productCode": candidate("goodsLines.2.productCode", "AG.EAT.41097"),
  "goodsLines.2.quantity": candidate("goodsLines.2.quantity", 20),
  "goodsLines.2.unitPrice": candidate("goodsLines.2.unitPrice", 12.3)
}));
assert.equal(displacedOntoFirstCopy.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.C125N320FM");
assert.equal(displacedOntoFirstCopy.replacements.fields["goodsLines.0.quantity"], undefined);
assert.equal(displacedOntoFirstCopy.replacements.fields["goodsLines.1.productCode"]?.[0]?.value, "AG.EAT.41097");
assert.equal(displacedOntoFirstCopy.replacements.fields["goodsLines.1.quantity"], undefined);
assert.equal(displacedOntoFirstCopy.replacements.fields["goodsLines.2.quantity"], undefined);
assert.equal(displacedOntoFirstCopy.replacements.fields["goodsLines.2.productCode"], undefined);

const codeOnlyDisplaced = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.C125N320FM", 0.08, 0.4),
  word("1Adet", 0.4, 0.4),
  word("961,4400EUR", 0.62, 0.4),
  word("AG.EAT.41097", 0.08, 0.48),
  word("60Adet", 0.4, 0.48),
  word("12,3000EUR", 0.62, 0.48),
  word("AG.EAT.41097", 0.08, 0.56),
  word("20Adet", 0.4, 0.56),
  word("12,3000EUR", 0.62, 0.56)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.41097"),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.EAT.216887"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 60),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 12.3),
  "goodsLines.2.productCode": candidate("goodsLines.2.productCode", "AG.EAT.41097"),
  "goodsLines.2.quantity": candidate("goodsLines.2.quantity", 20),
  "goodsLines.2.unitPrice": candidate("goodsLines.2.unitPrice", 12.3)
}));
assert.equal(codeOnlyDisplaced.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.C125N320FM");
assert.equal(codeOnlyDisplaced.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 1);
assert.equal(codeOnlyDisplaced.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 961.44);
assert.equal(codeOnlyDisplaced.replacements.fields["goodsLines.2.quantity"], undefined);

const conflictingHs = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("GTIP", 0.7, 0.2),
  word("AG.SCH.A9F94440", 0.08, 0.4),
  word("37Adet", 0.4, 0.4),
  word("853620100011", 0.7, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F94440"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 37),
  "goodsLines.0.hsCode": [
    ...candidate("goodsLines.0.hsCode", "853620100011"),
    { ...candidate("goodsLines.0.hsCode", "853890990000")[0]!, candidateId: "other-page-hs", confidence: 0.4 }
  ]
}));
assert.equal(conflictingHs.replacements.fields["goodsLines.0.hsCode"]?.[0]?.value, "853620100011");
const appliedHs = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.hsCode": [
    ...candidate("goodsLines.0.hsCode", "853620100011"),
    { ...candidate("goodsLines.0.hsCode", "853890990000")[0]!, candidateId: "other-page-hs", confidence: 0.4 }
  ]
}), conflictingHs);
assert.equal(appliedHs.fields["goodsLines.0.hsCode"]?.length, 1);
assert.equal(appliedHs.fields["goodsLines.0.hsCode"]?.[0]?.value, "853620100011");

const printedOrigin = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Aciklamasi", 0.28, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F94440", 0.08, 0.4),
  word("FRANCE", 0.3, 0.4),
  word("BULGARISTAN", 0.8, 0.4),
  word("37Adet", 0.4, 0.4),
  word("34,5660EUR", 0.62, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F94440"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 37),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "DE")
}));
assert.equal(printedOrigin.replacements.fields["goodsLines.0.origin"]?.[0]?.value, "FR");

const twoCountries = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Aciklamasi", 0.28, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F94440", 0.08, 0.4),
  word("FRANCE", 0.26, 0.4),
  word("CHINA", 0.32, 0.4),
  word("37Adet", 0.4, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F94440"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 37),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "DE")
}));
assert.equal(twoCountries.replacements.fields["goodsLines.0.origin"], undefined);

console.log("foundation8-25.9 native cell binding contract ok");
