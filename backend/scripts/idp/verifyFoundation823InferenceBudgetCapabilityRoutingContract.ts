import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const vision = read("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts");
const fusion = read("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const specialist = read("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.ts");
const skill = read("backend/idp-skills/invoice-goods-table/SKILL.md");
const numeric = read("backend/idp-skills/invoice-goods-table/references/numeric-semantics.md");

const legacyVisionRecoverySuppressed = [
  'non-critical-scalar-recovery', 'critical-scalar-evidence-recovery', 'origin-evidence-recovery', 'goods-numeric-semantic-recovery'
].every(token => vision.includes(token)) && vision.includes('!params.suppressLegacyRecovery');
const adaptiveRecoverySuppressed = fusion.includes('executableAdaptiveRecoveryPlan') && fusion.includes('? { ...adaptiveRecoveryPlan, actions: [] }');
const specialistOwnsRecoveryWhenEnabled = fusion.includes('suppressLegacyRecovery: env.foundation8ShadowModelEnabled');
const goodsChunkExecutionSerialized = specialist.includes('await worker();') && !specialist.includes('Promise.all([worker(), worker()])');
const packagingVsCommercialQuantitySkill = skill.includes('quantity+commercial-unit pair') && numeric.includes('25.000 KG') && numeric.includes('1250 Koli');
const arithmeticCannotProveRole = numeric.includes('never proves column identity');
const recoveryDisciplineInSkill = skill.includes('one semantic reading per bounded evidence chunk') && skill.includes('domain-local and evidence-targeted');

assert(legacyVisionRecoverySuppressed);
assert(adaptiveRecoverySuppressed);
assert(specialistOwnsRecoveryWhenEnabled);
assert(goodsChunkExecutionSerialized);
assert(packagingVsCommercialQuantitySkill);
assert(arithmeticCannotProveRole);
assert(recoveryDisciplineInSkill);
assert(!fusion.includes('supplierSpecificRules: true'));

console.log(JSON.stringify({
  event: 'foundation-8.23.inference-budget-capability-routing.contract.passed',
  acceptance: {
    legacyVisionRecoverySuppressed,
    adaptiveRecoverySuppressed,
    specialistOwnsRecoveryWhenEnabled,
    goodsChunkExecutionSerialized,
    packagingVsCommercialQuantitySkill,
    arithmeticCannotProveRole,
    recoveryDisciplineInSkill
  },
  guardrails: {
    primaryVisionStillRuns: vision.includes('evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE'),
    foundation8PromotionStillOptIn: fusion.includes('env.foundation8ReconciledPromotionEnabled'),
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
