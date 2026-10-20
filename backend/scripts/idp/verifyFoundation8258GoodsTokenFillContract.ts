import assert from "node:assert/strict";
import { discoverCorroboratedGoodsNumericFill } from "../../src/modules/idp/candidates/invoiceGoodsTokenFill.js";
import { discoverInvoiceOriginFieldCandidates } from "../../src/modules/idp/candidates/invoiceOriginCandidateDiscovery.js";
import type { CanonicalDocument, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

function word(text: string, x0: number, y0: number): CanonicalWord {
  return { text, bbox: { x0, y0, x1: x0 + 0.08, y1: y0 + 0.015 }, confidence: 1, source: "NATIVE_TEXT" };
}

function document(words: CanonicalWord[]): CanonicalDocument {
  return {
    schemaVersion: "1.0",
    source: { fileName: "token-fill.pdf" },
    analysis: {
      contentKind: "DIGITAL",
      pageCount: 1,
      digitalPageCount: 1,
      scannedPageCount: 0,
      mixedPageCount: 0,
      nativeTextPageCount: 1
    },
    pages: [{
      pageNumber: 1,
      width: 1,
      height: 1,
      rotation: 0,
      nativeText: words.map((item) => item.text).join(" "),
      nativeCharCount: 10,
      nativeWordCount: words.length,
      hasNativeText: true,
      imageCount: 0,
      imageCoverage: 0,
      contentKind: "DIGITAL",
      words,
      lines: []
    }]
  };
}

function goods(fields: FieldCandidateEnvelope["fields"]): FieldCandidateEnvelope {
  return { version: "1", fields };
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

const p0087 = discoverCorroboratedGoodsNumericFill(document([
  word("111-030", 0.1, 0.4),
  word("5000", 0.4, 0.4),
  word("0.0563", 0.55, 0.4),
  word("281.50", 0.7, 0.4)
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "111-030"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5000),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 281.5)
}));
assert.equal(p0087.fields["goodsLines.0.unitPrice"]?.[0]?.value, 0.0563);
assert.equal(p0087.fields["goodsLines.0.quantity"], undefined);
assert.equal(p0087.fields["goodsLines.0.lineTotal"], undefined);

const alreadyPriced = discoverCorroboratedGoodsNumericFill(document([
  word("111-030", 0.1, 0.4),
  word("5000", 0.4, 0.4),
  word("9.99", 0.55, 0.4),
  word("281.50", 0.7, 0.4)
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "111-030"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5000),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 0.0563),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 281.5)
}));
assert.equal(Object.keys(alreadyPriced.fields).length, 0);

const yemQuantity = discoverCorroboratedGoodsNumericFill(document([
  word("91101", 0.1, 0.3),
  word("1250", 0.3, 0.3),
  word("25000", 0.45, 0.3),
  word("0.70", 0.6, 0.3),
  word("17500", 0.75, 0.3)
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "91101"),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 0.7),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 17500)
}));
assert.equal(yemQuantity.fields["goodsLines.0.quantity"]?.[0]?.value, 25000);

const yemKept = discoverCorroboratedGoodsNumericFill(document([
  word("91101", 0.1, 0.3),
  word("1250", 0.3, 0.3),
  word("0.70", 0.6, 0.3),
  word("17500", 0.75, 0.3)
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "91101"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 1250),
  "goodsLines.0.unitPrice": candidate("goodsLines.0.unitPrice", 0.7),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 17500)
}));
assert.equal(Object.keys(yemKept.fields).length, 0);

const noToken = discoverCorroboratedGoodsNumericFill(document([
  word("111-030", 0.1, 0.4),
  word("5000", 0.4, 0.4),
  word("281.50", 0.7, 0.4)
]), "seg", goods({
  "goodsLines.0.productCode": candidate("goodsLines.0.productCode", "111-030"),
  "goodsLines.0.quantity": candidate("goodsLines.0.quantity", 5000),
  "goodsLines.0.lineTotal": candidate("goodsLines.0.lineTotal", 281.5)
}));
assert.equal(Object.keys(noToken.fields).length, 0);

function anchoredGoods(codes: string[]): FieldCandidateEnvelope {
  const fields: FieldCandidateEnvelope["fields"] = {};
  codes.forEach((code, index) => {
    const y = 0.3 + index * 0.05;
    const field = `goodsLines.${index}.productCode`;
    fields[field] = [{
      candidateId: field,
      field,
      value: code,
      confidence: 0.9,
      extractor: "vision",
      evidence: [{ segmentId: "seg", pageNumber: 1, bbox: { x0: 0.1, y0: y, x1: 0.22, y1: y + 0.015 }, text: code, contentSource: "PAGE_IMAGE" }]
    }];
  });
  return { version: "1", fields };
}

const weakOrigin = discoverInvoiceOriginFieldCandidates(document([
  word("A1001", 0.1, 0.3), word("NO", 0.8, 0.3),
  word("A1002", 0.1, 0.35), word("TUBE", 0.8, 0.35),
  word("A1003", 0.1, 0.4), word("TUBE", 0.8, 0.4),
  word("A1004", 0.1, 0.45), word("TUBE", 0.8, 0.45)
]), "seg", anchoredGoods(["A1001", "A1002", "A1003", "A1004"]), { requireCountryColumn: true });
assert.equal(Object.keys(weakOrigin.fields).length, 0);

const strongOrigin = discoverInvoiceOriginFieldCandidates(document([
  word("A1001", 0.1, 0.3), word("POLAND", 0.8, 0.3),
  word("A1002", 0.1, 0.35), word("CHINA", 0.8, 0.35),
  word("A1003", 0.1, 0.4), word("FRANCE", 0.8, 0.4),
  word("A1004", 0.1, 0.45), word("SPAIN", 0.8, 0.45)
]), "seg", anchoredGoods(["A1001", "A1002", "A1003", "A1004"]), { requireCountryColumn: true });
assert.equal(strongOrigin.fields["goodsLines.0.origin"]?.[0]?.value, "PL");
assert.equal(strongOrigin.fields["goodsLines.1.origin"]?.[0]?.value, "CN");
assert.equal(strongOrigin.fields["goodsLines.3.origin"]?.[0]?.value, "ES");

console.log({
  event: "foundation-8.25.8.goods-token-fill.contract.passed",
  fillsOnlyAbsentCorroboratedCell: true,
  keepsVisionValue: true,
  prefersCommercialQuantityOverPackagingCount: true,
  leavesCellEmptyWhenTokenIsAbsent: true
});
