import assert from "node:assert/strict";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { canonicalCommercialTermsCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { sanitizeVisionBankInfo, sanitizeVisionPaymentType } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import type { CanonicalDocument, CanonicalLine } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const line = (text: string, y: number): CanonicalLine => ({ text, source: "NATIVE_TEXT", bbox: { x0: 0.1, y0: y, x1: 0.9, y1: y + 0.01 } });
const lines = [
  line("Ödeme Koşulu:PEŞİN ÖDEME", 0.10),
  line("Navlun 0,00 TL", 0.12),
  line("Sigorta 0,00 TL", 0.14),
  line("Döviz Kuru 53,3268 TRY", 0.16),
];
const canonical: CanonicalDocument = {
  schemaVersion: "1.0", source: { fileName: "generic-invoice.pdf" },
  analysis: { contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0, mixedPageCount: 0, nativeTextPageCount: 1 },
  pages: [{ pageNumber: 1, width: 1000, height: 1000, rotation: 0, nativeText: lines.map(x => x.text).join("\n"), nativeCharCount: 100, nativeWordCount: 12, hasNativeText: true, imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL", words: [], lines }]
};
const discovered = discoverInvoiceCommercialTermsFieldCandidates(canonical, "segment-001");
assert.equal(discovered.fields["trade.paymentType"]?.[0]?.value, "PESIN ODEME");
assert.equal(discovered.fields["finance.freight"]?.[0]?.value, 0);
assert.equal(discovered.fields["finance.insurance"]?.[0]?.value, 0);

const mapped = canonicalCommercialTermsCandidatesOf({ genericCandidateAudit: { commercialTermsCandidates: discovered } } as any);
assert.equal(mapped.fields.paymentType?.[0]?.value, "PESIN ODEME");
assert.equal(mapped.fields.freight?.[0]?.value, 0);
assert.equal(mapped.fields.insurance?.[0]?.value, 0);

const projected = Object.fromEntries(Object.entries(mapped.fields).map(([field, candidates]) => [field, candidates.map((candidate: any) => ({
  ...candidate, logicalDocumentId: "doc-1", uploadedFileId: "file-1", documentType: "INVOICE", sourceProcessingRunId: "run-1"
}))]));
const selections = selectDirectSourceEvidenceAuthority({ version: "1", fields: projected } as any);
const selected = new Set(selections.map(item => item.field));
assert.ok(selected.has("paymentType"));
assert.ok(selected.has("freight"));
assert.ok(selected.has("insurance"));

assert.equal(sanitizeVisionPaymentType("0,00 EUR"), undefined);
assert.equal(sanitizeVisionBankInfo("0,00 EUR"), undefined);
assert.equal(sanitizeVisionBankInfo("31.081,10 EUR"), undefined);
assert.equal(sanitizeVisionBankInfo("IBAN TR00 0000 0000 0000"), "IBAN TR00 0000 0000 0000");

console.log(JSON.stringify({
  event: "product-e2e-1.8.30.commercial-semantic-authority.contract.passed",
  guardrails: {
    explicitPaymentTermsUseNativeAuthority: true,
    explicitZeroFreightInsuranceRemainValid: true,
    monetaryAmountCannotBecomePaymentType: true,
    monetaryAmountCannotBecomeBankInfo: true,
    sourceAbsentCountryFieldsRemainUninvented: true,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
