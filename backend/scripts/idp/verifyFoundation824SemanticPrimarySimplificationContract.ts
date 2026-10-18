import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const env = read("backend/src/config/env.ts");
const fusion = read("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
const skill = read("backend/src/modules/idp/llm/invoiceExtractionSkill.ts");

const acceptance = {
  boundedSpecialistsFollowEnabledSemanticRuntime: /foundation8TextSpecialistsEnabled:\s*bool\(process\.env\.FOUNDATION8_TEXT_SPECIALISTS_ENABLED,\s*true\)/.test(env),
  textSpecialistsDoNotRunFromShadowFlagAlone: /env\.foundation8ShadowModelEnabled\s*&&\s*env\.foundation8TextSpecialistsEnabled/.test(fusion),
  groundedVisionGoodsDoNotCompeteWithNativeRows: /roleBoundWithoutCompetingGoods/.test(fusion) && /!\/\^goodsLines/.test(fusion),
  finalGoodsAreNotRedemotedByNativeAuthority: !/const finalRoleGuardedCandidates = enforceValidatedNativeGoodsFieldAuthority\(/.test(fusion),
  sourceTruthPreservationSkill: skill.includes("SOURCE-TRUTH PRESERVATION"),
  packageVsCommercialQuantitySkill: skill.includes("Never substitute carton/koli/pallet/package count for a KG/PCS/ADET commercial quantity"),
  rowCompletenessSkill: skill.includes("Do not emit HS-only skeleton rows"),
  productIdentitySkill: skill.includes("product/model/material/stock/part number and HS/GTIP are different identifiers"),
  explicitGoodsOriginSkill: skill.includes("DOCUMENT-LEVEL GOODS ORIGIN")
};
for (const [name, ok] of Object.entries(acceptance)) assert.equal(ok, true, name);

const guardrails = {
  supplierSpecificRules: /\b(?:YEM|VOLTA|VEKMAR|CELIKEL|ÇELİKEL|NINGBO|PML|DERMETERNAL)\b/i.test(skill),
  invoiceSpecificProductionConstants: /31081\.10|17500|25000|1250|4M717|871110000011/.test(skill),
  directNormalizedWrite: /normalizedData\s*=|\$set\s*:\s*\{\s*normalizedData/.test(fusion)
};
assert.equal(guardrails.supplierSpecificRules, false);
assert.equal(guardrails.invoiceSpecificProductionConstants, false);
assert.equal(guardrails.directNormalizedWrite, false);

console.log(JSON.stringify({ event: "foundation-8.24.semantic-primary-simplification.contract.passed", acceptance, guardrails }, null, 2));
