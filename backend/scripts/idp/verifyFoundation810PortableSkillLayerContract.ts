import assert from "node:assert/strict";
import fs from "node:fs";
import { listIdpSkillNames, loadIdpSkill, renderIdpSkillContext } from "../../src/modules/idp/skills/skillRegistry.js";

const expected = ["invoice-commercial","invoice-goods-table","invoice-logistics","invoice-parties","invoice-reconciliation","invoice-understanding"];
const names = listIdpSkillNames();
assert.deepEqual(names, expected);

for (const name of names) {
  const skill = loadIdpSkill(name);
  assert.equal(skill.metadata.name, name);
  assert.ok(skill.metadata.version);
  assert.ok(skill.metadata.description.length > 20);
  assert.ok(skill.metadata.capabilities.length > 0);
  assert.ok(skill.instructions.length > 80);
  const rendered = renderIdpSkillContext(skill);
  assert.ok(rendered.includes(`# Skill: ${name}`));
}

const goods = loadIdpSkill("invoice-goods-table");
assert.deepEqual(goods.references.map(r => r.name), ["multi-page-tables.md","numeric-semantics.md","row-identity.md"]);
const goodsContext = renderIdpSkillContext(goods);
assert.match(goodsContext, /HS\/GTIP token alone cannot materialize a goods row/i);
assert.match(goodsContext, /Arithmetic validates an extraction/i);

const allText = names.map(name => {
  const skill = loadIdpSkill(name);
  return [fs.readFileSync(skill.skillPath, "utf8"), ...skill.references.map(r => r.content)].join("\n");
}).join("\n").toUpperCase();

// Portable production knowledge must not contain corpus answers or case/supplier identities.
for (const forbidden of ["VED146", "VED2026000000146", "CELIKEL", "ÇELIKEL", "DERMETERNAL", "NINGBO JIANGBEI", "P0087/26-27", "VOLTA", "YEM_5646309988"]) {
  assert.equal(allText.includes(forbidden), false, `Portable skill knowledge leaked eval/case identity: ${forbidden}`);
}

console.log(JSON.stringify({
  event: "foundation-8.1.portable-skill-layer.contract.passed",
  skills: names.map(name => {
    const skill = loadIdpSkill(name);
    return { name, version: skill.metadata.version, capabilities: skill.metadata.capabilities, references: skill.references.map(r => r.name) };
  }),
  acceptance: {
    portableSkillDirectoriesDiscoverable: true,
    skillFrontmatterValidated: true,
    progressiveReferencesLoadable: true,
    goodsRowIdentityKnowledgePresent: true,
    arithmeticIsValidationNotExtraction: true,
    corpusAnswersExcludedFromSkills: true
  },
  guardrails: {
    productionExtractionWiredToSkills: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    modelOrOcrRequired: false,
    databaseMutation: false,
    directNormalizedWrite: false
  }
}, null, 2));
