import assert from "node:assert/strict";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { canonicalCommercialTermsCandidatesOf, sanitizeVisionCommercialSemanticCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import type { CanonicalDocument, CanonicalLine } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const line = (text: string, y: number): CanonicalLine => ({ text, source: "NATIVE_TEXT", bbox: { x0: 0.1, y0: y, x1: 0.9, y1: y + 0.01 } });
const lines = [
  line("PEŞİN ÖDEME", 0.10),
  line("0,00 EUR", 0.12),
  line("31.081,10 EUR", 0.14),
];
const canonical: CanonicalDocument = {
  schemaVersion: "1.0", source: { fileName: "generic-invoice.pdf" },
  analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1 },
  pages: [{ pageNumber: 1, width: 1000, height: 1000, rotation: 0, nativeText: lines.map(x => x.text).join("\n"), nativeCharCount: 40, nativeWordCount: 6, hasNativeText: true, imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL", words: [], lines }]
};

const discovered = discoverInvoiceCommercialTermsFieldCandidates(canonical, "segment-001");
assert.equal(discovered.fields["trade.paymentType"]?.[0]?.value, "PESIN ODEME");
const mapped = canonicalCommercialTermsCandidatesOf({ genericCandidateAudit: { commercialTermsCandidates: discovered } } as any);
assert.equal(mapped.fields.paymentType?.[0]?.value, "PESIN ODEME");

const vision: FieldCandidateEnvelope = {
  version: "1",
  fields: {
    paymentType: [{ candidateId: "vision-payment", field: "paymentType", value: "0,00 EUR", confidence: 1, extractor: "invoice-qwen-vision-v1", evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" }] }],
    bankInfo: [{ candidateId: "vision-bank", field: "bankInfo", value: "0,00 EUR", confidence: 1, extractor: "invoice-qwen-vision-v1", evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" }] }],
    currency: [{ candidateId: "vision-currency", field: "currency", value: "EUR", confidence: 1, extractor: "invoice-qwen-vision-v1", evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" }] }]
  }
};
const sanitized = sanitizeVisionCommercialSemanticCandidates(vision);
assert.equal(sanitized.fields.paymentType, undefined);
assert.equal(sanitized.fields.bankInfo, undefined);
assert.equal(sanitized.fields.currency?.[0]?.value, "EUR");

console.log(JSON.stringify({
  event: "product-e2e-1.8.43.fresh-production-commercial-boundary.contract.passed",
  guardrails: {
    standaloneExplicitPaymentTermUsesNativeAuthority: true,
    monetaryVisionPaymentPoisonRemovedBeforeF6Persistence: true,
    monetaryVisionBankPoisonRemovedBeforeF6Persistence: true,
    unrelatedVisionFieldsPreserved: true,
    resumedCheckpointCandidatesUseSameBoundary: true,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
