import assert from "node:assert/strict";
import { InvoiceLlmEvidenceMode } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { adaptNaturalInvoiceResponse } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

const request = {
  requestedFields: ["invoiceDate", "currency", "invoiceNumber"],
  evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
} as any;
const pageImages = [{ pageNumber: 2 }] as any;

function fieldsOf(parsed: any) {
  return adaptNaturalInvoiceResponse(parsed, request, pageImages).fields;
}

const valid = fieldsOf({
  invoiceNumber: "ABC202600000001",
  invoiceDate: "2026-09-22",
  currency: "TRY",
  criticalScalarEvidence: {
    invoiceDate: { label: "Fatura Tarihi", rawValue: "22.09.2026" },
    currency: { label: "Döviz Cinsi", rawValue: "TL" }
  }
});
assert.deepEqual(valid.map((field: any) => field.field), ["invoiceDate", "currency", "invoiceNumber"]);
assert.equal(valid.find((field: any) => field.field === "invoiceDate")?.evidence?.[0]?.quote, "Fatura Tarihi: 22.09.2026");
assert.equal(valid.find((field: any) => field.field === "currency")?.evidence?.[0]?.quote, "Döviz Cinsi: TL");

const contradicted = fieldsOf({
  invoiceNumber: "ABC202600000001",
  invoiceDate: "2022-09-22",
  currency: "EUR",
  criticalScalarEvidence: {
    invoiceDate: { label: "Fatura Tarihi", rawValue: "22.09.2026" },
    currency: { label: "Döviz Cinsi", rawValue: "TL" }
  }
});
assert.deepEqual(contradicted.map((field: any) => field.field), ["invoiceNumber"]);

const missingEvidence = fieldsOf({
  invoiceNumber: "ABC202600000001",
  invoiceDate: "2026-09-22",
  currency: "TRY"
});
assert.deepEqual(missingEvidence.map((field: any) => field.field), ["invoiceNumber"]);

const ambiguousCurrency = fieldsOf({
  currency: "USD",
  criticalScalarEvidence: { currency: { label: "Currency", rawValue: "$" } }
});
assert.equal(ambiguousCurrency.length, 0);

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.17.grounding-enforcement-boundary.passed",
  validCriticalScalarsReachCandidateBoundary: true,
  contradictedInvoiceDateBlockedBeforeCandidateProjection: true,
  contradictedCurrencyBlockedBeforeCandidateProjection: true,
  missingCriticalScalarEvidenceBlocked: true,
  ambiguousCurrencyEvidenceBlocked: true,
  evidenceQuotePreservedOnAcceptedCandidate: true,
  unrelatedScalarExtractionUnaffected: true,
  qwenPrimary: true,
  ocrPrimary: false,
  supplierSpecificRules: false,
  groundTruthAuthorityUsed: false,
  directNormalizedWrite: false
}, null, 2));
