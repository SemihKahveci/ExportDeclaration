import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeVisionCommercialSemanticCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const imageEvidence = [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }];
const envelope: any = {
  version: "1",
  fields: {
    paymentType: [{ candidateId: "vision:payment-poison", field: "paymentType", value: "0,00 EUR", confidence: 1, extractor: "adaptive-vision", evidence: imageEvidence }],
    bankInfo: [{ candidateId: "vision:bank-poison", field: "bankInfo", value: "0,00 EUR", confidence: 1, extractor: "adaptive-vision", evidence: imageEvidence }],
    currency: [{ candidateId: "vision:currency", field: "currency", value: "EUR", confidence: 1, extractor: "adaptive-vision", evidence: imageEvidence }]
  }
};

const sanitized = sanitizeVisionCommercialSemanticCandidates(envelope);
assert.equal(sanitized.fields.paymentType, undefined, "adaptive/recovery payment monetary poison must be removed");
assert.equal(sanitized.fields.bankInfo, undefined, "adaptive/recovery bank monetary poison must be removed");
assert.equal(sanitized.fields.currency?.[0]?.value, "EUR", "unrelated adaptive candidate must remain");

// Regression guard for the actual final persistence boundary. The primary
// Vision pass was already sanitized in 1.8.43; the production regression came
// from adaptive recovery being role-guarded but not semantic-sanitized again.
const fusionPath = path.resolve(process.cwd(), "backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const source = fs.readFileSync(fusionPath, "utf8");
const finalBoundary = /const\s+finalRoleGuardedCandidates\s*=\s*enforceVisionDocumentRoleAuthority\(\s*sanitizeVisionCommercialSemanticCandidates\(adaptiveGoodsNumericExecution\.candidates\)/s.test(source);
assert.equal(finalBoundary, true, "final adaptive-recovery output must be semantic-sanitized immediately before F6 persistence");

const primaryBoundary = /enforceVisionDocumentRoleAuthority\(\s*sanitizeVisionCommercialSemanticCandidates\(execution\.candidates\)/s.test(source);
assert.equal(primaryBoundary, true, "primary Vision output must retain the same semantic sanitizer");

console.log(JSON.stringify({
  event: "product-e2e-1.8.45.adaptive-recovery-persistence-boundary.contract.passed",
  guardrails: {
    primaryVisionBoundarySanitized: primaryBoundary,
    adaptiveRecoveryFinalBoundarySanitized: finalBoundary,
    monetaryPaymentPoisonRemoved: sanitized.fields.paymentType === undefined,
    monetaryBankPoisonRemoved: sanitized.fields.bankInfo === undefined,
    unrelatedAdaptiveCandidatePreserved: sanitized.fields.currency?.[0]?.value === "EUR",
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
