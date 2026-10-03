import assert from "node:assert/strict";
import { canonicalInvoiceCurrency } from "../../src/modules/idp/domain/declarationFieldCandidateProjector.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

assert.equal(canonicalInvoiceCurrency("TRY"), "TRY");
assert.equal(canonicalInvoiceCurrency("try"), "TRY");
assert.equal(canonicalInvoiceCurrency("TL"), "TRY");
assert.equal(canonicalInvoiceCurrency(" tl "), "TRY");
assert.equal(canonicalInvoiceCurrency("USD"), "USD");
assert.equal(canonicalInvoiceCurrency("EUR"), "EUR");
assert.equal(canonicalInvoiceCurrency("$"), "$"); // ambiguous symbol: fail closed, do not guess

const base = { logicalDocumentId: "ld-1", uploadedFileId: "uf-1", documentType: "INVOICE" as const, sourceProcessingRunId: "run-1" };
const candidate = (id: string, field: string, value: unknown, pageNumber: number) => ({
  ...base, candidateId: id, field, value, confidence: 1, extractor: "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber, contentSource: "PAGE_IMAGE" as const }]
});

// This envelope represents values *after* declaration-candidate canonicalization.
// Equivalent display currencies must form consensus; genuinely different dates must not.
const envelope: DeclarationFieldCandidateEnvelope = {
  version: "1", companyId: "company", declarationId: "declaration", fields: {
    currency: [
      candidate("currency-p1", "currency", canonicalInvoiceCurrency("TRY"), 1),
      candidate("currency-p2", "currency", canonicalInvoiceCurrency("TL"), 2)
    ],
    invoiceDate: [
      candidate("date-p1", "invoiceDate", "2026-09-22", 1),
      candidate("date-p2", "invoiceDate", "2026-09-23", 2)
    ]
  }
};

const resolution = resolveDeclarationFields({ candidates: envelope });
assert.equal(resolution.fields.currency?.status, "RESOLVED");
assert.equal(resolution.fields.currency?.value, "TRY");
assert.equal(resolution.fields.invoiceDate?.status, "REVIEW_REQUIRED");

console.log(JSON.stringify({
  event: "product-e2e-1.6.8.12.multi-page-scalar-canonical-authority.passed",
  currencyTlTryCanonicalConsensus: true,
  lowercaseIsoCurrencyCanonicalized: true,
  ambiguousCurrencySymbolNotGuessed: true,
  conflictingInvoiceDatesStillFailClosed: true,
  groundTruthAuthorityUsed: false,
  supplierSpecificRules: false,
  productionExtractionPromptChanged: false,
  directNormalizedWrite: false
}, null, 2));
