/**
 * Dilim 4: empty productCode filled from explicit native SKU column only.
 */
import assert from "node:assert/strict";
import { discoverInvoiceProductCodeFieldCandidates } from "../../src/modules/idp/candidates/invoiceProductCodeCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

function word(text: string, x0: number, y0: number, x1 = x0 + 0.06, y1 = y0 + 0.015) {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: 1, source: "NATIVE_TEXT" as const };
}

const canonical = {
  documentId: "sku-fill",
  pages: [{
    pageNumber: 1,
    width: 1,
    height: 1,
    words: [
      word("SKU", 0.08, 0.18),
      word("Description", 0.28, 0.18),
      word("HS", 0.62, 0.18),
      word("AB-1001", 0.08, 0.28),
      word("Motor", 0.28, 0.28),
      word("85369010", 0.62, 0.28),
      word("AB-1002", 0.08, 0.36),
      word("Relay", 0.28, 0.36),
      word("85369020", 0.62, 0.36),
    ],
    nativeText: "SKU Description HS AB-1001 Motor 85369010 AB-1002 Relay 85369020",
    ocrText: "",
  }],
} as unknown as CanonicalDocument;

const goods: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    "goodsLines.0.hsCode": [{
      candidateId: "h0", field: "goodsLines.0.hsCode", value: "85369010",
      confidence: 0.9, extractor: "test",
      evidence: [{ segmentId: "s", pageNumber: 1, bbox: { x0: 0.62, y0: 0.28, x1: 0.68, y1: 0.295 }, text: "85369010", contentSource: "NATIVE_TEXT" }],
    }],
    "goodsLines.1.hsCode": [{
      candidateId: "h1", field: "goodsLines.1.hsCode", value: "85369020",
      confidence: 0.9, extractor: "test",
      evidence: [{ segmentId: "s", pageNumber: 1, bbox: { x0: 0.62, y0: 0.36, x1: 0.68, y1: 0.375 }, text: "85369020", contentSource: "NATIVE_TEXT" }],
    }],
    "goodsLines.0.description": [{
      candidateId: "d0", field: "goodsLines.0.description", value: "Motor",
      confidence: 0.9, extractor: "test", evidence: [],
    }],
    "goodsLines.1.description": [{
      candidateId: "d1", field: "goodsLines.1.description", value: "Relay",
      confidence: 0.9, extractor: "test", evidence: [],
    }],
  },
};

const filled = discoverInvoiceProductCodeFieldCandidates(canonical, "seg", goods);
assert.equal(filled.fields["goodsLines.0.productCode"]?.[0]?.value, "AB-1001");
assert.equal(filled.fields["goodsLines.1.productCode"]?.[0]?.value, "AB-1002");

// Do not overwrite existing productCode.
const already: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    ...goods.fields,
    "goodsLines.0.productCode": [{
      candidateId: "p0", field: "goodsLines.0.productCode", value: "KEEP",
      confidence: 0.99, extractor: "test", evidence: [],
    }],
  },
};
const noOverwrite = discoverInvoiceProductCodeFieldCandidates(canonical, "seg", already);
assert.equal(noOverwrite.fields["goodsLines.0.productCode"], undefined);
assert.equal(noOverwrite.fields["goodsLines.1.productCode"]?.[0]?.value, "AB-1002");

// Reject when SKU column value equals row HS.
const hsAsSkuCanonical = {
  documentId: "hs-as-sku",
  pages: [{
    pageNumber: 1,
    width: 1,
    height: 1,
    words: [
      word("SKU", 0.08, 0.18),
      word("85369010", 0.08, 0.28),
      word("85369020", 0.08, 0.36),
    ],
    nativeText: "SKU 85369010 85369020",
    ocrText: "",
  }],
} as unknown as CanonicalDocument;
const rejected = discoverInvoiceProductCodeFieldCandidates(hsAsSkuCanonical, "seg", goods);
assert.equal(Object.keys(rejected.fields).length, 0);

// No product-code header → fail closed.
const noHeader = {
  documentId: "no-header",
  pages: [{
    pageNumber: 1,
    width: 1,
    height: 1,
    words: [word("AB-1001", 0.08, 0.28), word("AB-1002", 0.08, 0.36)],
    nativeText: "AB-1001 AB-1002",
    ocrText: "",
  }],
} as unknown as CanonicalDocument;
assert.equal(Object.keys(discoverInvoiceProductCodeFieldCandidates(noHeader, "seg", goods).fields).length, 0);

console.log("verifyProductCodeLateFillContract: ok");
