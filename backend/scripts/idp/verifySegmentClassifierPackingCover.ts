import assert from "node:assert/strict";
import { classifyDocumentSegment } from "../../src/modules/idp/classifier/segmentClassifier.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";

function doc(text: string, contentKind: "SCANNED" | "DIGITAL" = "SCANNED"): CanonicalDocument {
  return {
    documentId: "doc-1",
    pageCount: 1,
    pages: [
      {
        pageNumber: 1,
        width: 1000,
        height: 1400,
        contentKind,
        ocrApplied: contentKind === "SCANNED",
        ocrText: contentKind === "SCANNED" ? text : undefined,
        nativeText: contentKind === "DIGITAL" ? text : undefined,
        words: []
      }
    ]
  } as CanonicalDocument;
}

function segment(anchor?: string): DocumentSegment {
  return {
    segmentId: "segment-001",
    startPage: 1,
    endPage: 1,
    pageNumbers: [1],
    boundaryReason: "test",
    boundarySignals: { anchor }
  } as DocumentSegment;
}

const packingCoverOcr = `
MACIN TEKSTIL
TO: LIMITED LIABILITY COMPANY
DATE 14.09.2026
INVOICE NO MCN2026000000767
PACKING COVER LIST
NO COMMODITY N.W (KGS) G.W (KGS) KAP
DYED KNITTING FABRICS 30/150 PENYE LYC 2 iplik 336,66 KGS 339,92 KGS 14
TOTAL 16.255,60 KGS 16.346,69 KGS 664
`;

const packingCover = classifyDocumentSegment(doc(packingCoverOcr), segment("INVOICE"));
assert.equal(packingCover.documentType, ClassifiedDocumentType.PACKING_LIST);
assert.ok(packingCover.evidence.some((item) => item.includes("packing-cover-list")));
assert.ok(packingCover.evidence.some((item) => item.startsWith("suppressed-weak-invoice-fields:")));

const plainPacking = classifyDocumentSegment(
  doc("PACKING LIST\nItem Qty Weight\n1 BOX 10 KG", "DIGITAL"),
  segment()
);
assert.equal(plainPacking.documentType, ClassifiedDocumentType.PACKING_LIST);

const commercial = classifyDocumentSegment(
  doc("COMMERCIAL INVOICE\nInvoice No: INV-1\nInvoice Date: 01.01.2026\nTotal USD 100", "DIGITAL"),
  segment("INVOICE")
);
assert.equal(commercial.documentType, ClassifiedDocumentType.INVOICE);

const invoiceOnly = classifyDocumentSegment(
  doc("Seller Buyer\nInvoice No: INV-9\nInvoice Date: 02.02.2026\nAmount 50 EUR", "DIGITAL"),
  segment("INVOICE")
);
assert.equal(invoiceOnly.documentType, ClassifiedDocumentType.INVOICE);

const ceki = classifyDocumentSegment(
  doc("ÇEKİ LİSTESİ\nKap Adedi 12\nBrüt 100 KG", "DIGITAL"),
  segment()
);
assert.equal(ceki.documentType, ClassifiedDocumentType.PACKING_LIST);

console.log(
  JSON.stringify(
    {
      event: "segment-classifier.packing-cover.passed",
      packingCover: packingCover.documentType,
      plainPacking: plainPacking.documentType,
      commercial: commercial.documentType,
      invoiceOnly: invoiceOnly.documentType,
      ceki: ceki.documentType,
      guardrails: {
        packingCoverNotInvoice: packingCover.documentType !== ClassifiedDocumentType.INVOICE,
        commercialInvoicePreserved: commercial.documentType === ClassifiedDocumentType.INVOICE,
        invoiceNumberAloneStillInvoice: invoiceOnly.documentType === ClassifiedDocumentType.INVOICE
      }
    },
    null,
    2
  )
);
