import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeVisionCommercialSemanticCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const evidence = [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }];
const candidate = (candidateId: string, field: string, value: unknown) => ({
  candidateId, field, value, confidence: 1, extractor: "boundary-closure-fixture", evidence
});

const mixed: any = {
  version: "1",
  fields: {
    paymentType: [
      candidate("payment:poison", "paymentType", "0,00 EUR"),
      candidate("payment:valid", "paymentType", "PESIN ODEME")
    ],
    bankInfo: [
      candidate("bank:poison", "bankInfo", "0,00 EUR"),
      candidate("bank:valid", "bankInfo", "IBAN TR00 0000 0000 0000 0000 0000 00")
    ],
    currency: [candidate("currency:valid", "currency", "EUR")]
  }
};

const once = sanitizeVisionCommercialSemanticCandidates(mixed);
const twice = sanitizeVisionCommercialSemanticCandidates(once);

assert.deepEqual(once, twice, "commercial semantic sanitizer must be idempotent");
assert.deepEqual(once.fields.paymentType?.map((item: any) => item.value), ["PESIN ODEME"], "valid payment semantic must survive while monetary poison is removed");
assert.deepEqual(once.fields.bankInfo?.map((item: any) => item.value), ["IBAN TR00 0000 0000 0000 0000 0000 00"], "valid bank semantic must survive while monetary poison is removed");
assert.equal(once.fields.currency?.[0]?.value, "EUR", "unrelated candidates must survive the boundary unchanged");

const poisonOnly: any = {
  version: "1",
  fields: {
    paymentType: [candidate("payment:only-poison", "paymentType", "0,00 EUR")],
    bankInfo: [candidate("bank:only-poison", "bankInfo", "0,00 EUR")]
  }
};
const poisonOnlySanitized = sanitizeVisionCommercialSemanticCandidates(poisonOnly);
assert.equal(poisonOnlySanitized.fields.paymentType, undefined, "poison-only payment field must disappear before F6 persistence");
assert.equal(poisonOnlySanitized.fields.bankInfo, undefined, "poison-only bank field must disappear before F6 persistence");

const fusionPath = path.resolve(process.cwd(), "backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const source = fs.readFileSync(fusionPath, "utf8");
const primaryBoundary = /enforceVisionDocumentRoleAuthority\(\s*sanitizeVisionCommercialSemanticCandidates\(execution\.candidates\)/s.test(source);
const adaptiveFinalBoundary = /const\s+finalRoleGuardedCandidates\s*=\s*enforceVisionDocumentRoleAuthority\(\s*sanitizeVisionCommercialSemanticCandidates\(adaptiveGoodsNumericExecution\.candidates\)/s.test(source);
assert.equal(primaryBoundary, true, "primary Vision persistence ingress must remain sanitized");
assert.equal(adaptiveFinalBoundary, true, "final adaptive-recovery persistence ingress must remain sanitized");

console.log(JSON.stringify({
  event: "product-e2e-1.8.46.commercial-persistence-boundary-closure.passed",
  acceptance: {
    mixedPaymentPoisonRemovedValidSemanticPreserved: once.fields.paymentType?.length === 1 && once.fields.paymentType[0]?.value === "PESIN ODEME",
    mixedBankPoisonRemovedValidSemanticPreserved: once.fields.bankInfo?.length === 1 && String(once.fields.bankInfo[0]?.value).startsWith("IBAN "),
    poisonOnlyFieldsRemoved: poisonOnlySanitized.fields.paymentType === undefined && poisonOnlySanitized.fields.bankInfo === undefined,
    unrelatedCandidatePreserved: once.fields.currency?.[0]?.value === "EUR",
    sanitizerIdempotent: JSON.stringify(once) === JSON.stringify(twice),
    primaryVisionPersistenceIngressSanitized: primaryBoundary,
    adaptiveRecoveryPersistenceIngressSanitized: adaptiveFinalBoundary
  },
  guardrails: {
    contractOnly: true,
    ocrOrModelInference: false,
    databaseMutation: false,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
