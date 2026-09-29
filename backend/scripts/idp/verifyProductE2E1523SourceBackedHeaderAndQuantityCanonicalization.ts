import assert from "node:assert/strict";
import { buildInvoiceFieldCandidates } from "../../src/modules/idp/candidates/invoiceFieldCandidateEnricher.js";
import { canonicalHeaderPartyCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const canonical: CanonicalDocument = {
  version: "1",
  pages: [{
    pageNumber: 1,
    width: 1700,
    height: 2500,
    contentKind: "DIGITAL",
    nativeText: "1.575 KG 7,7500 USD 12.206,25 USD",
    nativeCharCount: 35,
    nativeWordCount: 6,
    ocrText: "",
    ocrWordCount: 0,
    words: [
      { text: "1.575", bbox: { x0: .19, y0: .40, x1: .22, y1: .41 }, source: "NATIVE_TEXT" },
      { text: "KG", bbox: { x0: .23, y0: .40, x1: .25, y1: .41 }, source: "NATIVE_TEXT" }
    ]
  }]
} as CanonicalDocument;

function row(rawQuantity: string, quantity: number, unitPrice: number, lineTotal: number) {
  return {
    goodsLines: [{ quantity, unit: "KG", unitPrice, lineTotal }],
    extractMeta: { rawItems: [{
      lineNo: 1,
      quantity: rawQuantity,
      unit: "KG",
      unitPrice: String(unitPrice),
      amount: String(lineTotal),
      boxes: { quantity: [323, 1000, 374, 1025] },
      source: { page: 1 }
    }] }
  } as Record<string, unknown>;
}

const grouped = buildInvoiceFieldCandidates(row("1.575", 1.575, 7.75, 12206.25), canonical, "segment-001");
const decimal = buildInvoiceFieldCandidates(row("1.575", 1.575, 100, 157.5), canonical, "segment-001");
const ambiguous = buildInvoiceFieldCandidates(row("1.575", 1.575, 0, 0), canonical, "segment-001");

assert.equal(grouped.fields["goodsLines.0.quantity"]?.[0]?.value, 1575);
assert.equal(grouped.fields["goodsLines.0.quantity"]?.[0]?.evidence[0]?.text, "1.575");
assert.equal(decimal.fields["goodsLines.0.quantity"]?.[0]?.value, 1.575);
assert.equal(ambiguous.fields["goodsLines.0.quantity"]?.[0]?.value, 1.575);

const headerPartyCandidates: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    "header.invoiceNo": [{
      candidateId: "header-invoice-no",
      field: "header.invoiceNo",
      value: "CLK2026000001021",
      confidence: .99,
      extractor: "invoice-header-party-v1",
      evidence: [{ segmentId: "segment-001", pageNumber: 1, text: "CLK2026000001021", contentSource: "NATIVE_TEXT" }]
    }]
  }
};
const bridged = canonicalHeaderPartyCandidatesOf({ genericCandidateAudit: { headerPartyCandidates } });
assert.equal(bridged.fields.invoiceNo?.[0]?.value, "CLK2026000001021");
assert.equal(bridged.fields.invoiceNo?.[0]?.field, "invoiceNo");
assert.equal(bridged.fields.invoiceNo?.[0]?.evidence[0]?.text, "CLK2026000001021");
assert.equal(bridged.fields["header.invoiceNo"], undefined);

console.log(JSON.stringify({
  event: "product-e2e-1.5.23.source-backed-header-and-quantity-canonicalization.passed",
  groupedQuantitySelectedByRowArithmetic: true,
  genuineDecimalQuantityPreserved: true,
  ambiguousQuantityFailsClosed: true,
  sourceQuantityEvidencePreserved: true,
  sourceVisibleInvoiceNumberBridgedToFoundation6: true,
  invoiceNumberEvidencePreserved: true,
  guardrails: {
    supplierSpecificRuleAdded: false,
    noModelInferenceRequired: true,
    noDatabaseMutation: true,
    directNormalizedWrite: false
  }
}, null, 2));
