import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
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

const punctuatedCountry = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Aciklamasi", 0.28, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.EAT.41097", 0.08, 0.4),
  word("EA", 0.24, 0.4),
  word("U.K", 0.3, 0.4),
  word("60Adet", 0.4, 0.4),
  word("12,3000EUR", 0.62, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.41097"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 60),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "MA")
}));
assert.equal(punctuatedCountry.replacements.fields["goodsLines.0.origin"]?.[0]?.value, "GB");

const transposedCountry = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Aciklamasi", 0.28, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.EAT.216557", 0.08, 0.4),
  word("GERAMNY", 0.3, 0.4),
  word("540Adet", 0.4, 0.4),
  word("1,9900EUR", 0.62, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.216557"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 540),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "MA")
}));
assert.equal(transposedCountry.replacements.fields["goodsLines.0.origin"]?.[0]?.value, "DE");

const ratedCurrent = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Aciklamasi", 0.28, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9V41225", 0.08, 0.4),
  word("30MA", 0.24, 0.4),
  word("FRANCE", 0.3, 0.4),
  word("173Adet", 0.4, 0.4),
  word("12,3000EUR", 0.62, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9V41225"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 173),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "MA")
}));
assert.equal(ratedCurrent.replacements.fields["goodsLines.0.origin"]?.[0]?.value, "FR");

const shiftedUniqueCode = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9F75240", 0.08, 0.4),
  word("9Adet", 0.4, 0.4),
  word("13,0700EUR", 0.62, 0.4),
  word("AG.SCH.33662", 0.08, 0.5),
  word("40Adet", 0.4, 0.5),
  word("41,0000EUR", 0.62, 0.5)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 40),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 41),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.33662"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 40),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 41)
}));
assert.equal(shiftedUniqueCode.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 9);
assert.equal(shiftedUniqueCode.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 13.07);
assert.equal(shiftedUniqueCode.replacements.fields["goodsLines.1.quantity"], undefined);

const thousandsQuantity = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.28, 0.2),
  word("Fiyat", 0.48, 0.2),
  word("Tutar", 0.7, 0.2),
  word("AG.ISO.BAK.EBL.007", 0.05, 0.4),
  word("1.068", 0.28, 0.4),
  word("15,1685", 0.48, 0.4),
  word("16.200,00", 0.7, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.ISO.BAK.EBL.007"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1.068),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 15168.5),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 16200)
}));
assert.equal(thousandsQuantity.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 1068);
assert.equal(thousandsQuantity.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 15.1685);
assert.equal(thousandsQuantity.conflicts.fields["goodsLines.0.quantity"], undefined);

const unitBesidePrice = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.28, 0.2),
  word("Birim", 0.36, 0.2),
  word("Fiyat", 0.42, 0.2),
  word("Tutar", 0.7, 0.2),
  word("AG.ISO.BAK.EBL.007", 0.05, 0.4),
  word("1.068", 0.28, 0.4),
  word("15,1685", 0.36, 0.4),
  word("16.200,00", 0.7, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.ISO.BAK.EBL.007"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1.068),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 15168.5),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 16200)
}));
assert.equal(unitBesidePrice.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 1068);
assert.equal(unitBesidePrice.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 15.1685);
assert.equal(unitBesidePrice.conflicts.fields["goodsLines.0.quantity"], undefined);

const unitUnderHeader = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.18),
  word("Aciklama", 0.2, 0.18),
  word("Miktar", 0.4, 0.222),
  word("Fiyat", 0.62, 0.238),
  word("AG.SCH.A9N18371", 0.05, 0.252),
  word("5", 0.36, 0.252),
  word("Adet", 0.44, 0.252),
  word("53,3700", 0.62, 0.252),
  word("AG.EAT.231273", 0.05, 0.36),
  word("28", 0.4, 0.36),
  word("2,9700", 0.62, 0.36)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.263535"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 53.37),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.EAT.231273"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 28),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 2.97)
}));
assert.equal(unitUnderHeader.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9N18371");
assert.equal(unitUnderHeader.replacements.fields["goodsLines.0.quantity"], undefined);
assert.equal(unitUnderHeader.replacements.fields["goodsLines.1.productCode"], undefined);

const missingLetter = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.32, 0.2),
  word("Fiyat", 0.5, 0.2),
  word("Tutar", 0.72, 0.2),
  word("AG.SCH.A9A26476", 0.05, 0.4),
  word("54Adet", 0.32, 0.4),
  word("17,3500EUR", 0.5, 0.4),
  word("936,90EUR", 0.72, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A926476"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 54),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 17350),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 936900)
}));
assert.equal(missingLetter.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9A26476");
assert.equal(missingLetter.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 17.35);
assert.equal(missingLetter.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 936.9);

const ampereRange = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Aciklamasi", 0.22, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.GV2P06", 0.05, 0.4),
  word("1-1,6", 0.22, 0.4),
  word("20Adet", 0.4, 0.4),
  word("23,4000EUR", 0.62, 0.4),
  word("AG.SCH.OTHER9", 0.05, 0.5),
  word("5Adet", 0.4, 0.5),
  word("10,0000EUR", 0.62, 0.5)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.GV2P06"),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 1.6),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.OTHER9"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 5),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10)
}));
assert.equal(ampereRange.replacements.fields["goodsLines.0.quantity"]?.[0]?.value, 20);
assert.equal(ampereRange.replacements.fields["goodsLines.0.unitPrice"]?.[0]?.value, 23.4);

const alignedDifferentCode = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.58, 0.2),
  word("Tutar", 0.76, 0.2),
  word("AG.SCH.A9N18371", 0.05, 0.4),
  word("5Adet", 0.4, 0.4),
  word("53,3700EUR", 0.58, 0.4),
  word("266,85EUR", 0.76, 0.4),
  word("AG.SCH.C40N4", 0.05, 0.5),
  word("11Adet", 0.4, 0.5),
  word("298,5000EUR", 0.58, 0.5),
  word("3.283,50EUR", 0.76, 0.5)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.263535"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 53.37),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.C40N4"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 11),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 298.5)
}));
assert.equal(alignedDifferentCode.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9N18371");
assert.equal(alignedDifferentCode.replacements.fields["goodsLines.0.lineTotal"]?.[0]?.value, 266.85);
assert.equal(alignedDifferentCode.replacements.fields["goodsLines.0.quantity"], undefined);

const clauseRow = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C080N420FM"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "11/1-1-a"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 113)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.C080N420FM", 0.08, 0.4),
  word("5Adet", 0.4, 0.4),
  word("823,2100EUR", 0.62, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C080N420FM"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "11/1-1-a"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 113)
})));
assert.equal(clauseRow.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.C080N420FM");
assert.equal(clauseRow.fields["goodsLines.1.productCode"], undefined);
assert.equal(clauseRow.fields["goodsLines.1.unitPrice"], undefined);

const insertedCode = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9R41440", 0.05, 0.4),
  word("35Adet", 0.4, 0.4),
  word("29,5600EUR", 0.62, 0.4),
  word("AG.SCH.C2544V250", 0.05, 0.5),
  word("18Adet", 0.4, 0.5),
  word("371,6100EUR", 0.62, 0.5),
  word("AG.SCH.EXTRA9", 0.05, 0.6),
  word("1Adet", 0.4, 0.6),
  word("10,0000EUR", 0.62, 0.6)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9R141440"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 35),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 29.56),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.C2544V250"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 18),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 371.61)
}));
assert.equal(insertedCode.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9R41440");
assert.equal(insertedCode.replacements.fields["goodsLines.1.productCode"], undefined);

const transposedCode = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.4, 0.2),
  word("Fiyat", 0.62, 0.2),
  word("AG.SCH.A9R41463", 0.05, 0.4),
  word("50Adet", 0.4, 0.4),
  word("34,5700EUR", 0.62, 0.4),
  word("AG.SCH.EXTRA9", 0.05, 0.5),
  word("1Adet", 0.4, 0.5),
  word("10,0000EUR", 0.62, 0.5)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9R14163"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 50),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 34.57)
}));
assert.equal(transposedCode.replacements.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9R41463");

const splitPage = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C2544V250"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 18),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 371.61)
}), bindNativeGoodsCells(document([
  page(1, "DIGITAL", [
    word("Kod", 0.04, 0.2),
    word("Aciklama", 0.24, 0.2),
    word("Miktar", 0.44, 0.2),
    word("Fiyat", 0.58, 0.2),
    word("Tutar", 0.74, 0.2),
    word("Gtip", 0.88, 0.2),
    word("AG.SCH.C2544V250", 0.04, 0.45),
    word("18Adet", 0.44, 0.45),
    word("371,6100EUR", 0.58, 0.45),
    word("6.688,98EUR", 0.74, 0.45),
    word("FRANCE", 0.24, 0.85),
    word("4.697,70EUR", 0.74, 0.85),
    word("853620100011", 0.88, 0.85)
  ]),
  page(2, "DIGITAL", [
    word("AG.SCH.A9V41463", 0.04, 0.08),
    word("VIGI", 0.24, 0.08),
    word("105Adet", 0.44, 0.08),
    word("44,7400EUR", 0.58, 0.08)
  ])
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C2544V250"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 18),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 371.61)
})));
assert.equal(splitPage.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.C2544V250");
assert.equal(splitPage.fields["goodsLines.1.productCode"]?.[0]?.value, "AG.SCH.A9V41463");
assert.equal(splitPage.fields["goodsLines.1.quantity"]?.[0]?.value, 105);
assert.equal(splitPage.fields["goodsLines.1.unitPrice"]?.[0]?.value, 44.74);
assert.equal(splitPage.fields["goodsLines.1.lineTotal"]?.[0]?.value, 4697.7);
assert.equal(splitPage.fields["goodsLines.1.origin"]?.[0]?.value, "FR");
assert.equal(splitPage.fields["goodsLines.1.hsCode"]?.[0]?.value, "853620100011");
assert.equal(splitPage.fields["goodsLines.1.description"]?.[0]?.value, "VIGI");
assert.equal(String(splitPage.fields["goodsLines.1.lineTotal"]?.[0]?.candidateId).includes("page-break-review"), false);

const splitPageUnjoined = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C2544V250"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 18)
}), bindNativeGoodsCells(document([
  page(1, "DIGITAL", [
    word("Kod", 0.04, 0.2),
    word("Aciklama", 0.24, 0.2),
    word("Miktar", 0.44, 0.2),
    word("Fiyat", 0.58, 0.2),
    word("Tutar", 0.74, 0.2),
    word("AG.SCH.C2544V250", 0.04, 0.45),
    word("18Adet", 0.44, 0.45),
    word("371,6100EUR", 0.58, 0.45),
    word("999,00EUR", 0.74, 0.85)
  ]),
  page(2, "DIGITAL", [
    word("AG.SCH.A9V41463", 0.04, 0.08),
    word("105Adet", 0.44, 0.08),
    word("44,7400EUR", 0.58, 0.08)
  ])
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C2544V250"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 18)
})));
assert.equal(splitPageUnjoined.fields["goodsLines.1.productCode"]?.[0]?.value, "AG.SCH.A9V41463");
assert.equal(splitPageUnjoined.fields["goodsLines.1.quantity"]?.[0]?.value, 105);
assert.equal(splitPageUnjoined.fields["goodsLines.1.lineTotal"]?.[0]?.value, null);
assert.equal(String(splitPageUnjoined.fields["goodsLines.1.lineTotal"]?.[0]?.candidateId).includes("page-break-review"), true);

const postalBesideGtip = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.28, 0.2),
  word("Fiyat", 0.42, 0.2),
  word("Tutar", 0.56, 0.2),
  word("Gtip", 0.88, 0.2),
  word("OG.RVT.BAR.24.040.065", 0.08, 0.4),
  word("1Adet", 0.28, 0.4),
  word("752,0000EUR", 0.42, 0.4),
  word("752,00EUR", 0.56, 0.4),
  word("4000", 0.76, 0.4),
  word("853690950000", 0.88, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752)
}));
assert.equal(postalBesideGtip.replacements.fields["goodsLines.0.hsCode"]?.[0]?.value, "853690950000");

const shipmentBesideGtip = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.28, 0.2),
  word("Fiyat", 0.42, 0.2),
  word("Tutar", 0.56, 0.2),
  word("Gonderilme", 0.78, 0.2),
  word("Gtip", 0.9, 0.2),
  word("OG.RVT.BAR.24.040.065", 0.08, 0.4),
  word("1Adet", 0.28, 0.4),
  word("752,0000EUR", 0.42, 0.4),
  word("752,00EUR", 0.56, 0.4),
  word("4000", 0.7, 0.4),
  word("853690950000", 0.9, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752)
}));
assert.equal(shipmentBesideGtip.replacements.fields["goodsLines.0.hsCode"]?.[0]?.value, "853690950000");

const twoTariffCodes = bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.28, 0.2),
  word("Fiyat", 0.42, 0.2),
  word("Gtip", 0.88, 0.2),
  word("OG.RVT.BAR.24.040.065", 0.08, 0.4),
  word("1Adet", 0.28, 0.4),
  word("752,0000EUR", 0.42, 0.4),
  word("853690950000", 0.82, 0.4),
  word("853620100011", 0.9, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752)
}));
assert.equal(twoTariffCodes.replacements.fields["goodsLines.0.hsCode"], undefined);

const originLabelOnGoodsRow = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752),
  "goodsLines.0.hsCode": candidate("goodsLines.0.hsCode", "24.040.065")
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  placed("Kodu", 0.14, 0.18, 0.268),
  placed("Aciklamasi", 0.12, 0.2, 0.296),
  placed("Miktar", 0.32, 0.36, 0.277),
  placed("Fiyat", 0.36, 0.41, 0.282),
  placed("Tutari", 0.58, 0.64, 0.287),
  placed("Gtip", 0.88, 0.91, 0.277),
  placed("OG.RVT.BAR.24.040.065", 0.1, 0.22, 0.307),
  placed("MENSEI", 0.23, 0.27, 0.307),
  placed("1", 0.32, 0.33, 0.307),
  placed("752,0000", 0.36, 0.41, 0.307),
  placed("752,00", 0.58, 0.62, 0.307),
  placed("853690950000", 0.86, 0.94, 0.307)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752),
  "goodsLines.0.hsCode": candidate("goodsLines.0.hsCode", "24.040.065")
})));
assert.equal(originLabelOnGoodsRow.fields["goodsLines.0.hsCode"]?.[0]?.value, "853690950000");

const invoice0225 = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 752)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  placed("Kodu", 0.14, 0.18, 0.268),
  placed("Aciklamasi", 0.13, 0.19, 0.296),
  placed("Aciklamasi", 0.25, 0.32, 0.277),
  placed("Miktar", 0.31, 0.36, 0.277),
  placed("Birim", 0.36, 0.4, 0.273),
  placed("Fiyat", 0.36, 0.4, 0.282),
  placed("Hizmet", 0.58, 0.64, 0.277),
  placed("Tutari", 0.58, 0.64, 0.287),
  placed("Yeri", 0.76, 0.81, 0.28),
  placed("Gonderilme", 0.8, 0.86, 0.274),
  placed("Gtip", 0.87, 0.92, 0.277),
  placed("OG.RVT.BAR.24.040.065", 0.1, 0.22, 0.307),
  placed("MENSEI", 0.22, 0.27, 0.307),
  placed("1", 0.31, 0.33, 0.307),
  placed("Adet", 0.33, 0.36, 0.307),
  placed("752,0000", 0.36, 0.41, 0.307),
  placed("752,00", 0.57, 0.62, 0.307),
  placed("4000", 0.75, 0.79, 0.316),
  placed("Karayolu", 0.81, 0.86, 0.307),
  placed("853690950000", 0.86, 0.94, 0.307)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "OG.RVT.BAR.24.040.065"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 752),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 752)
})));
assert.equal(invoice0225.fields["goodsLines.0.hsCode"]?.[0]?.value, "853690950000");

const countryDescription = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.216925"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "GERMANY"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 20),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 1.85)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  placed("Kodu", 0.12, 0.2, 0.28),
  placed("Aciklamasi", 0.22, 0.3, 0.295),
  placed("Miktar", 0.3, 0.34, 0.29),
  placed("Fiyat", 0.34, 0.4, 0.295),
  placed("Tutari", 0.56, 0.64, 0.3),
  placed("27", 0.06, 0.1, 0.58),
  placed("AG.EAT.216925", 0.1, 0.19, 0.58),
  placed("GERMANY", 0.22, 0.29, 0.58),
  placed("20", 0.3, 0.34, 0.58),
  placed("1,8500", 0.34, 0.4, 0.58),
  placed("M22-DL-R", 0.1, 0.16, 0.59),
  placed("ISIKLI", 0.16, 0.2, 0.59),
  placed("BUTON", 0.1, 0.14, 0.6),
  placed("KAFASI", 0.14, 0.18, 0.6),
  placed("YAYLI", 0.18, 0.21, 0.6),
  placed("KIRMIZI", 0.1, 0.15, 0.61),
  placed("AG.SCH.XB5AA61", 0.1, 0.19, 0.66),
  placed("5", 0.3, 0.34, 0.66),
  placed("2,9700", 0.34, 0.4, 0.66)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.216925"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "GERMANY"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 20),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 1.85)
})));
assert.equal(countryDescription.fields["goodsLines.0.description"]?.[0]?.value, "M22-DL-R ISIKLI BUTON KAFASI YAYLI KIRMIZI");

const vedHeaders = [
  placed("Kodu", 0.08, 0.16, 0.2),
  placed("Aciklamasi", 0.2, 0.3, 0.2),
  placed("Miktar", 0.36, 0.44, 0.2),
  placed("Fiyat", 0.48, 0.56, 0.2),
  placed("Tutari", 0.62, 0.72, 0.2)
];
const correctedCode = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9R14163"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 4),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 12.5)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.A9R41463", 0.08, 0.2, 0.4),
  placed("SPAIN", 0.22, 0.28, 0.4),
  placed("KACAK", 0.22, 0.28, 0.42),
  placed("AKIM", 0.28, 0.33, 0.42),
  placed("KORUMA", 0.22, 0.28, 0.44),
  placed("ROLESI", 0.28, 0.34, 0.44),
  placed("4", 0.38, 0.42, 0.4),
  placed("12,50", 0.5, 0.56, 0.4),
  placed("AG.SCH.OTHER1", 0.08, 0.2, 0.6),
  placed("1", 0.38, 0.42, 0.6),
  placed("3,00", 0.5, 0.56, 0.6)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9R14163"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "AG.SCH.A9R14163 SPAIN KACAK AKIM"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 4),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 12.5),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.OTHER1"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 3)
})));
assert.equal(correctedCode.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9R41463");
assert.equal(String(correctedCode.fields["goodsLines.0.description"]?.[0]?.value).includes("SPAIN"), false);
assert.equal(String(correctedCode.fields["goodsLines.0.description"]?.[0]?.value).includes("KORUMA"), true);

const czechOrigin = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.LC1G225LSEA"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 333.55)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.LC1G225LSEA", 0.08, 0.2, 0.4),
  placed("CZECH", 0.22, 0.28, 0.4),
  placed("REPUBLIC", 0.28, 0.34, 0.4),
  placed("1", 0.38, 0.42, 0.4),
  placed("333,55", 0.5, 0.58, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.LC1G225LSEA"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 333.55)
})));
assert.equal(czechOrigin.fields["goodsLines.0.origin"]?.[0]?.value, "CZ");

const tunisiaOrigin = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.ABB.2CSM204753R1801"),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "AI"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 7.56)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.ABB.2CSM204753R1801", 0.08, 0.22, 0.4),
  placed("TUNUSIA", 0.24, 0.32, 0.4),
  placed("5", 0.38, 0.42, 0.4),
  placed("7,56", 0.5, 0.56, 0.4),
  placed("AI", 0.74, 0.78, 0.4),
  placed("SULAY", 0.78, 0.84, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.ABB.2CSM204753R1801"),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "AI"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 7.56)
})));
assert.equal(tunisiaOrigin.fields["goodsLines.0.origin"]?.[0]?.value, "TN");

const materialCode = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "CR-M4SS"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 4),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 2.27)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.ABB.1SVR405651R3000", 0.08, 0.22, 0.4),
  placed("CR-M4SS", 0.24, 0.32, 0.4),
  placed("4", 0.38, 0.42, 0.4),
  placed("2,27", 0.5, 0.56, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "CR-M4SS"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 4),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 2.27)
})));
assert.equal(materialCode.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.ABB.1SVR405651R3000");

const postalCode = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F94232"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 10),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "22222"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 204),
  "goodsLines.1.origin": candidate("goodsLines.1.origin", "CN")
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.A9F94232", 0.08, 0.2, 0.4),
  placed("2", 0.38, 0.42, 0.4),
  placed("10,00", 0.5, 0.56, 0.4),
  placed("AG.SCH.C2545E250", 0.08, 0.2, 0.55),
  placed("FRANCE", 0.22, 0.28, 0.55),
  placed("17", 0.38, 0.42, 0.55),
  placed("208,86", 0.5, 0.58, 0.55),
  placed("22222", 0.8, 0.86, 0.7)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F94232"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 10),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "22222"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 204),
  "goodsLines.1.origin": candidate("goodsLines.1.origin", "CN")
})));
assert.equal(postalCode.fields["goodsLines.1.productCode"]?.[0]?.value, "AG.SCH.C2545E250");
assert.equal(postalCode.fields["goodsLines.1.quantity"]?.[0]?.value, 17);
assert.equal(postalCode.fields["goodsLines.1.origin"]?.[0]?.value, "FR");

const countryOnlyReview = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.189912"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "ROMANIA"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 30.11)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.EAT.189912", 0.08, 0.2, 0.4),
  placed("ROMANIA", 0.22, 0.3, 0.4),
  placed("1", 0.38, 0.42, 0.4),
  placed("30,11", 0.5, 0.56, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.189912"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "ROMANIA"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 30.11)
})));
assert.equal(String(countryOnlyReview.fields["goodsLines.0.description"]?.[0]?.candidateId).includes(":cell-review:"), true);
const reviewed = resolveDeclarationFields({
  candidates: {
    version: "1",
    companyId: "company",
    declarationId: "declaration",
    fields: {
      "goodsLines.0.description": [{
        candidateId: String(countryOnlyReview.fields["goodsLines.0.description"]?.[0]?.candidateId),
        field: "goodsLines.0.description",
        value: null,
        confidence: 0.5,
        extractor: "invoice-native-cell-binding-v1",
        logicalDocumentId: "doc",
        uploadedFileId: "file",
        documentType: DocumentType.INVOICE,
        evidence: []
      }]
    }
  }
});
assert.equal(reviewed.fields["goodsLines.0.description"]?.status, "REVIEW_REQUIRED");
assert.equal(reviewed.fields["goodsLines.0.description"]?.value, undefined);

const shiftedDespiteLaterCopy = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C125N320FM"),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "CN"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 40),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 30.37),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 1214.8),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.C125N320FM"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 838.9)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.A9V41225", 0.08, 0.2, 0.4),
  placed("FRANCE", 0.22, 0.28, 0.4),
  placed("40", 0.38, 0.42, 0.4),
  placed("30,37", 0.5, 0.56, 0.4),
  placed("1.214,80", 0.62, 0.7, 0.4),
  placed("AG.SCH.C125N320FM", 0.08, 0.2, 0.6),
  placed("1", 0.38, 0.42, 0.6),
  placed("838,90", 0.5, 0.58, 0.6)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C125N320FM"),
  "goodsLines.0.origin": candidate("goodsLines.0.origin", "CN"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 40),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 30.37),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 1214.8),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.C125N320FM"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 1),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 838.9)
})));
assert.equal(shiftedDespiteLaterCopy.fields["goodsLines.0.productCode"]?.[0]?.value, "AG.SCH.A9V41225");
assert.equal(shiftedDespiteLaterCopy.fields["goodsLines.0.origin"]?.[0]?.value, "FR");

const unprintedTotal = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C12B3TM160L"),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 17895.9),
  "goodsLines.0.hsCode": candidate("goodsLines.0.hsCode", "853890990000")
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.C12B3TM160L", 0.08, 0.2, 0.4),
  placed("102,0000", 0.5, 0.58, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.C12B3TM160L"),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 17895.9),
  "goodsLines.0.hsCode": candidate("goodsLines.0.hsCode", "853890990000")
})));
assert.equal(String(unprintedTotal.fields["goodsLines.0.lineTotal"]?.[0]?.candidateId).includes(":cell-review:"), true);

const roundedPrice = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.ATS01N209QN"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 20),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 69.4),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 1388.12)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.ATS01N209QN", 0.08, 0.22, 0.4),
  placed("20", 0.38, 0.42, 0.4),
  placed("69,4060", 0.5, 0.58, 0.4),
  placed("1.388,12", 0.62, 0.72, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.ATS01N209QN"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 20),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 69.4),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 1388.12)
})));
assert.equal(roundedPrice.fields["goodsLines.0.unitPrice"]?.[0]?.value, 69.406);
assert.equal(roundedPrice.fields["goodsLines.0.lineTotal"]?.[0]?.value, 1388.12);

const shiftedDescription = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "33662 MX ACTIRMA BOBINI NS800-3200"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 9),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 13.07)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.A9F75240", 0.08, 0.16, 0.4),
  placed("IC60N", 0.2, 0.24, 0.4),
  placed("OTOMATIK", 0.24, 0.28, 0.4),
  placed("SIGORTA", 0.28, 0.32, 0.4),
  placed("9", 0.38, 0.42, 0.4),
  placed("13,07", 0.5, 0.56, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "33662 MX ACTIRMA BOBINI NS800-3200"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 9),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 13.07)
})));
assert.equal(shiftedDescription.fields["goodsLines.0.description"]?.[0]?.value, "OTOMATIK SIGORTA");
assert.equal(shiftedDescription.fields["goodsLines.0.unitPrice"]?.[0]?.value, 13.07);

const matchingDescription = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "IC60N OTOMATIK SIGORTA"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 9),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 13.07)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...vedHeaders,
  placed("AG.SCH.A9F75240", 0.08, 0.16, 0.4),
  placed("IC60N", 0.2, 0.24, 0.4),
  placed("OTOMATIK", 0.24, 0.28, 0.4),
  placed("SIGORTA", 0.28, 0.32, 0.4),
  placed("9", 0.38, 0.42, 0.4),
  placed("13,07", 0.5, 0.56, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "IC60N OTOMATIK SIGORTA"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 9),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 13.07)
})));
assert.equal(matchingDescription.fields["goodsLines.0.description"]?.[0]?.value, "IC60N OTOMATIK SIGORTA");

const imageOnly = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "33662 MX ACTIRMA BOBINI NS800-3200"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 9),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 13.07)
}), bindNativeGoodsCells(document([page(1, "SCANNED", [
  ...vedHeaders,
  placed("AG.SCH.A9F75240", 0.08, 0.16, 0.4),
  placed("OTOMATIK", 0.24, 0.28, 0.4),
  placed("SIGORTA", 0.28, 0.32, 0.4),
  placed("9", 0.38, 0.42, 0.4),
  placed("13,07", 0.5, 0.56, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75240"),
  "goodsLines.0.description": candidate("goodsLines.0.description", "33662 MX ACTIRMA BOBINI NS800-3200"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 9),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 13.07)
})));
assert.equal(imageOnly.fields["goodsLines.0.description"]?.[0]?.value, "33662 MX ACTIRMA BOBINI NS800-3200");

const simpleHeaders = [
  word("Kod", 0.05, 0.2),
  word("Miktar", 0.32, 0.2),
  word("Fiyat", 0.5, 0.2),
  word("Tutar", 0.7, 0.2)
];
const keptAndMissing = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.167594"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 150000),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 18.92),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 2270.4),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.OTHER1"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 5),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10),
  "goodsLines.1.lineTotal": candidate("goodsLines.1.lineTotal", 50)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...simpleHeaders,
  word("AG.EAT.167594", 0.05, 0.4),
  word("120", 0.32, 0.4),
  word("18,9200", 0.5, 0.4),
  word("2.270,40", 0.7, 0.4),
  word("AG.SCH.C2545E250", 0.05, 0.55),
  word("17", 0.32, 0.55),
  word("208,8600", 0.5, 0.55),
  word("3.550,62", 0.7, 0.55),
  word("AG.SCH.OTHER1", 0.05, 0.7),
  word("5", 0.32, 0.7),
  word("10,0000", 0.5, 0.7),
  word("50,00", 0.7, 0.7)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.EAT.167594"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 150000),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 18.92),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 2270.4),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.OTHER1"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 5),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10),
  "goodsLines.1.lineTotal": candidate("goodsLines.1.lineTotal", 50)
})));
assert.equal(keptAndMissing.fields["goodsLines.0.quantity"]?.[0]?.value, 120);
assert.equal(keptAndMissing.fields["goodsLines.0.unitPrice"]?.[0]?.value, 18.92);
assert.equal(keptAndMissing.fields["goodsLines.0.lineTotal"]?.[0]?.value, 2270.4);
assert.equal(keptAndMissing.fields["goodsLines.1.productCode"]?.[0]?.value, "AG.SCH.C2545E250");
assert.equal(keptAndMissing.fields["goodsLines.1.quantity"]?.[0]?.value, 17);
assert.equal(keptAndMissing.fields["goodsLines.1.unitPrice"]?.[0]?.value, 208.86);
assert.equal(keptAndMissing.fields["goodsLines.1.lineTotal"]?.[0]?.value, 3550.62);
assert.equal(keptAndMissing.fields["goodsLines.2.productCode"]?.[0]?.value, "AG.SCH.OTHER1");
assert.equal(keptAndMissing.fields["goodsLines.2.quantity"]?.[0]?.value, 5);

const repeatedCode = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9V41463"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 105),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 44.74),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 4697.7),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.OTHER1"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 5),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10),
  "goodsLines.1.lineTotal": candidate("goodsLines.1.lineTotal", 50)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  ...simpleHeaders,
  word("AG.SCH.A9V41463", 0.05, 0.4),
  word("11", 0.32, 0.4),
  word("49,4900", 0.5, 0.4),
  word("544,39", 0.7, 0.4),
  word("AG.SCH.A9V41463", 0.05, 0.55),
  word("105", 0.32, 0.55),
  word("44,7400", 0.5, 0.55),
  word("4.697,70", 0.7, 0.55),
  word("AG.SCH.OTHER1", 0.05, 0.7),
  word("5", 0.32, 0.7),
  word("10,0000", 0.5, 0.7),
  word("50,00", 0.7, 0.7)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9V41463"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 105),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 44.74),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 4697.7),
  "goodsLines.1.productCode": candidate("goodsLines.1.productCode", "AG.SCH.OTHER1"),
  "goodsLines.1.quantity": candidate("goodsLines.1.quantity", 5),
  "goodsLines.1.unitPrice": candidate("goodsLines.1.unitPrice", 10),
  "goodsLines.1.lineTotal": candidate("goodsLines.1.lineTotal", 50)
})));
assert.equal(repeatedCode.fields["goodsLines.0.quantity"]?.[0]?.value, 11);
assert.equal(repeatedCode.fields["goodsLines.0.unitPrice"]?.[0]?.value, 49.49);
assert.equal(repeatedCode.fields["goodsLines.0.lineTotal"]?.[0]?.value, 544.39);
assert.equal(repeatedCode.fields["goodsLines.1.quantity"]?.[0]?.value, 105);
assert.equal(repeatedCode.fields["goodsLines.1.unitPrice"]?.[0]?.value, 44.74);
assert.equal(repeatedCode.fields["goodsLines.1.lineTotal"]?.[0]?.value, 4697.7);
assert.equal(repeatedCode.fields["goodsLines.2.productCode"]?.[0]?.value, "AG.SCH.OTHER1");

const hizmetAmount = applyNativeGoodsCellBinding(goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75203"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 16.59)
}), bindNativeGoodsCells(document([page(1, "DIGITAL", [
  word("Kod", 0.08, 0.2),
  word("Miktar", 0.24, 0.2),
  word("Fiyat", 0.32, 0.2),
  word("KDV", 0.48, 0.2),
  word("Tutari", 0.5, 0.21),
  word("Hizmet", 0.55, 0.2),
  word("Tutari", 0.555, 0.21),
  word("AG.SCH.A9F75203", 0.05, 0.4),
  word("2", 0.24, 0.4),
  word("16,5900", 0.32, 0.4),
  word("0,00", 0.5, 0.4),
  word("33,18", 0.54, 0.4)
])]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "AG.SCH.A9F75203"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 2),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 16.59)
})));
assert.equal(hizmetAmount.fields["goodsLines.0.quantity"]?.[0]?.value, 2);
assert.equal(hizmetAmount.fields["goodsLines.0.unitPrice"]?.[0]?.value, 16.59);
assert.equal(hizmetAmount.fields["goodsLines.0.lineTotal"]?.[0]?.value, 33.18);

console.log("foundation8-25.9 native cell binding contract ok");
