import assert from "node:assert/strict";
import { loadAllGoldenCases } from "./foundation8/goldenCorpus.js";
import {
  decideGoldenCorpusAdmission,
  loadImpactManifest,
  selectGoldenCasesByImpact
} from "./foundation8/impactSelection.js";

const manifest = loadImpactManifest();
const goldenIds = loadAllGoldenCases().map(item => item.id).sort();

// Every manifest reference must point at a frozen golden case. This keeps impact
// selection deterministic and prevents typo-driven silent coverage loss.
const referencedIds = [...new Set(Object.values(manifest.tags).flat())].sort();
assert.deepEqual(referencedIds, goldenIds);

const goodsIdentity = selectGoldenCasesByImpact(["goods-row-identity"], manifest);
assert.deepEqual(goodsIdentity.caseIds, ["celikel","dermeternal","ningbo","pml","ved146","volta","yem"]);

const unsupportedHs = selectGoldenCasesByImpact(["unsupported-hs-fail-closed"], manifest);
assert.deepEqual(unsupportedHs.caseIds, ["dermeternal","ningbo","pml"]);

const focused = selectGoldenCasesByImpact(["multi-page-goods", "goods-numeric-semantics"], manifest);
assert.deepEqual(focused.caseIds, ["celikel","pml","ved146","volta","yem"]);

const duplicateTags = selectGoldenCasesByImpact([
  "unsupported-hs-fail-closed",
  "unsupported-hs-fail-closed"
], manifest);
assert.deepEqual(duplicateTags.caseIds, ["dermeternal","ningbo","pml"]);

// Unknown tags fail visible instead of silently widening to the full corpus.
const unknown = selectGoldenCasesByImpact(["future-table-rotation"], manifest);
assert.deepEqual(unknown.caseIds, []);
assert.deepEqual(unknown.unknownTags, ["future-table-rotation"]);

// Corpus admission is capability/failure-class driven, not invoice-count driven.
const duplicateCapability = decideGoldenCorpusAdmission([
  "goods-row-identity",
  "goods-numeric-semantics"
], manifest);
assert.equal(duplicateCapability.admit, false);
assert.equal(duplicateCapability.reason, "ALREADY_COVERED");

const novelCapability = decideGoldenCorpusAdmission([
  "goods-row-identity",
  "rotated-table-reading"
], manifest);
assert.equal(novelCapability.admit, true);
assert.deepEqual(novelCapability.novelTags, ["rotated-table-reading"]);

console.log(JSON.stringify({
  event: "foundation-8.8.capability-impact-corpus-scaling.contract.passed",
  corpus: {
    frozenCases: goldenIds.length,
    capabilityTags: Object.keys(manifest.tags).length,
    referencedCases: referencedIds
  },
  examples: {
    unsupportedHsCases: unsupportedHs.caseIds,
    focusedGoodsCases: focused.caseIds
  },
  acceptance: {
    impactManifestReferencesOnlyGoldenCases: true,
    singleCapabilitySelectsDeterministicSubset: true,
    multipleCapabilitiesUnionWithoutDuplicates: true,
    unknownCapabilityFailsVisible: true,
    alreadyCoveredInvoiceDoesNotRequireGoldenAdmission: true,
    novelFailureClassQualifiesForGoldenAdmission: true,
    productionVolumeDoesNotDefineGoldenCorpusSize: true
  },
  guardrails: {
    productionExtractionChanged: false,
    goldenExpectedFilesRemainEvalOnly: true,
    modelOrOcrRequired: false,
    databaseMutation: false,
    supplierSpecificProductionRules: false,
    invoiceSpecificProductionConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
