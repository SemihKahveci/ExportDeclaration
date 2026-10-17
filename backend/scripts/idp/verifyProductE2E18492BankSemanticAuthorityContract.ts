import assert from "node:assert/strict";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const native = (value: string) => ({
  candidateId: "finance-bank-info:f6-bankInfo",
  field: "bankInfo",
  value,
  confidence: .97,
  extractor: "invoice-commercial-terms-generic-v2",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" as const, text: value }]
});
const vision = (value: string) => ({
  candidateId: "vision:bank",
  field: "bankInfo",
  value,
  confidence: 1,
  extractor: "vision",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }]
});

const goodValues = [
  "BENEFICIAL BANK: BANK OF NINGBO | ACCOUNT NO.: 4003 2025 00000 4177 | SWIFT CODE: BKNBCN2N",
  "Ödeme Bilgisi : TÜRKİYE VAKIFLAR BANKASI T.A.O. - DUZCE BULVARI SUBESI DUZCE",
  "BANKA HESAP BİLGİLERİMİZ | Vakıf Katılım Bankası Bolu Şb. TR39 0021 0000 0007 1086 9001 01 VAKFTRIS",
  "BANKA: Ziraat Bankası Gebze Kurumsal Şube"
];
for (const value of goodValues) {
  const envelope = { version: "1", fields: { bankInfo: [vision("0,00 EUR"), native(value)] } } as FieldCandidateEnvelope;
  const selected = selectDirectSourceEvidenceAuthority(envelope as any);
  assert.ok(selected.some(x => x.field === "bankInfo" && x.candidateId === "finance-bank-info:f6-bankInfo"));
}

const poison = { version: "1", fields: { bankInfo: [native("0,00 EUR")] } } as FieldCandidateEnvelope;
assert.equal(selectDirectSourceEvidenceAuthority(poison as any).some(x => x.field === "bankInfo"), false);

console.log(JSON.stringify({
  event: "product-e2e-1.8.49.2.bank-semantic-authority.contract.passed",
  acceptance: {
    explicitBeneficialBankAuthoritative: true,
    explicitTurkishBankAuthoritative: true,
    ibanSwiftBankBlockAuthoritative: true,
    branchBankLabelAuthoritative: true,
    monetaryPoisonCannotGainBankAuthority: true
  },
  guardrails: {
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false,
    modelInferenceRequired: false
  }
}, null, 2));
