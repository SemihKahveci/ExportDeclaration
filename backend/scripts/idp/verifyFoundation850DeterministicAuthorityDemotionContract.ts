import assert from "node:assert/strict";
import { InvoiceEvidenceAuthorityRole, InvoiceEvidenceProducer, assertAuthorityPolicyInvariant, authorityDecisionFor } from "../../src/modules/idp/understanding/index.js";

const specialistGoods = authorityDecisionFor(InvoiceEvidenceProducer.SPECIALIST_UNDERSTANDING, "GOODS");
const roleBoundNative = authorityDecisionFor(InvoiceEvidenceProducer.ROLE_BOUND_NATIVE);
const nativeRow = authorityDecisionFor(InvoiceEvidenceProducer.VALIDATED_NATIVE_GOODS_ROW);
const hsToken = authorityDecisionFor(InvoiceEvidenceProducer.NATIVE_HS_TOKEN);
const legacy = authorityDecisionFor(InvoiceEvidenceProducer.LEGACY_DETERMINISTIC);
const ocr = authorityDecisionFor(InvoiceEvidenceProducer.OCR);
const vision = authorityDecisionFor(InvoiceEvidenceProducer.VISION);
for (const decision of [specialistGoods, roleBoundNative, nativeRow, hsToken, legacy, ocr, vision]) assertAuthorityPolicyInvariant(decision);
assert.equal(specialistGoods.role, InvoiceEvidenceAuthorityRole.SEMANTIC_PRIMARY);
assert.equal(specialistGoods.mayCreateGoodsRow, true);
assert.equal(specialistGoods.mayReplaceGroundedSemanticValue, true);
for (const deterministic of [roleBoundNative, nativeRow, hsToken, legacy]) {
  assert.equal(deterministic.mayCreateSemanticSection, false);
  assert.equal(deterministic.mayCreateGoodsRow, false);
  assert.equal(deterministic.mayReplaceGroundedSemanticValue, false);
}
assert.equal(hsToken.role, InvoiceEvidenceAuthorityRole.CORROBORATION);
assert.equal(hsToken.mayTriggerTargetedRecovery, true);
assert.equal(nativeRow.role, InvoiceEvidenceAuthorityRole.CORROBORATION);
assert.equal(legacy.role, InvoiceEvidenceAuthorityRole.LEGACY_FALLBACK);
assert.equal(ocr.role, InvoiceEvidenceAuthorityRole.RECOVERY_EVIDENCE);
assert.equal(vision.role, InvoiceEvidenceAuthorityRole.RECOVERY_EVIDENCE);
console.log(JSON.stringify({
  event: "foundation-8.5.deterministic-authority-demotion.contract.passed",
  authority: { semanticPrimary: specialistGoods.producer, corroboration: [roleBoundNative.producer, nativeRow.producer, hsToken.producer], recoveryEvidence: [ocr.producer, vision.producer], legacyFallback: legacy.producer },
  acceptance: {
    specialistUnderstandingOwnsSemanticTruth: specialistGoods.mayReplaceGroundedSemanticValue,
    specialistGoodsMayCreateAtomicRows: specialistGoods.mayCreateGoodsRow,
    roleBoundNativeCannotOverwriteSemanticTruth: !roleBoundNative.mayReplaceGroundedSemanticValue,
    validatedNativeRowCannotCreateAtomicRow: !nativeRow.mayCreateGoodsRow,
    isolatedHsTokenCannotCreateAtomicRow: !hsToken.mayCreateGoodsRow,
    legacyDeterministicCannotOverwriteSemanticTruth: !legacy.mayReplaceGroundedSemanticValue,
    deterministicConflictMayTriggerRecovery: roleBoundNative.mayTriggerTargetedRecovery && nativeRow.mayTriggerTargetedRecovery && hsToken.mayTriggerTargetedRecovery,
    rawOcrAndVisionAreEvidenceNotDirectAuthority: !ocr.mayReplaceGroundedSemanticValue && !vision.mayReplaceGroundedSemanticValue
  },
  guardrails: { productionFusionChanged: false, productionExtractionWiredToFoundation8: false, foundation6PromotionChanged: false, legacyNormalizeWriterChanged: false, supplierSpecificRules: false, invoiceSpecificProductionConstants: false, modelOrOcrRequired: false, databaseMutation: false, directNormalizedWrite: false }
}, null, 2));
