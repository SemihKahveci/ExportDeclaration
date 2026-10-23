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

console.log("foundation8-25.9 native cell binding contract ok");
