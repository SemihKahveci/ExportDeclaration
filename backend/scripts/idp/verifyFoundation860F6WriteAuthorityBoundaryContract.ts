import assert from "node:assert/strict";
import { foundation6OwnedPaths, preserveFoundation6ResolvedPaths } from "../../src/modules/idp/normalization/documentOwnedWriteBoundary.js";

const currentNormalizedData = {
  header: { invoiceNo: "F6-INV-001", totalAmount: 17500, userNote: "current" },
  packageInfo: { totalPackage: 21 },
  goodsLines: [
    { description: "ITEM A", quantity: 25000, unit: "KG", lineTotal: 17500 },
    { description: "ITEM B", quantity: 1, unit: "PCS", lineTotal: 560 }
  ],
  settingsOwned: { template: "A" }
};
const currentSourceTrace = {
  "header.invoiceNo": { provenance: "DECLARATION_FIELD_RESOLUTION", candidateId: "c1" },
  "header.totalAmount": { provenance: "DECLARATION_FIELD_RESOLUTION", candidateId: "c2" },
  "packageInfo.totalPackage": { provenance: "DECLARATION_FIELD_RESOLUTION", candidateId: "c3" },
  "goodsLines.0.quantity": { provenance: "DECLARATION_FIELD_RESOLUTION", candidateId: "c4" },
  "goodsLines.0.lineTotal": { provenance: "DECLARATION_FIELD_RESOLUTION", candidateId: "c5" },
  "goodsLines.1.quantity": { provenance: "DECLARATION_FIELD_RESOLUTION", candidateId: "c6" },
  "settingsOwned.template": { provenance: "USER_SETTING" }
};
const rebuiltNormalizedData = {
  header: { invoiceNo: "LEGACY-WRONG", totalAmount: 875, userNote: "legacy-can-rebuild" },
  packageInfo: { totalPackage: 1250 },
  goodsLines: [
    { description: "ITEM A", quantity: 1250, unit: "KG", lineTotal: 875 },
    { description: "ITEM B", quantity: 560, unit: "PCS", lineTotal: 560 }
  ],
  settingsOwned: { template: "B" }
};
const rebuiltSourceTrace = {
  "header.invoiceNo": { provenance: "LEGACY_NORMALIZE" },
  "header.totalAmount": { provenance: "LEGACY_NORMALIZE" },
  "packageInfo.totalPackage": { provenance: "LEGACY_NORMALIZE" },
  "goodsLines.0.quantity": { provenance: "LEGACY_NORMALIZE" },
  "goodsLines.0.lineTotal": { provenance: "LEGACY_NORMALIZE" },
  "goodsLines.1.quantity": { provenance: "LEGACY_NORMALIZE" },
  "settingsOwned.template": { provenance: "USER_SETTING" }
};

const owned = foundation6OwnedPaths(currentSourceTrace);
const result = preserveFoundation6ResolvedPaths({ currentNormalizedData, currentSourceTrace, rebuiltNormalizedData, rebuiltSourceTrace });

assert.equal((result.normalizedData.header as any).invoiceNo, "F6-INV-001");
assert.equal((result.normalizedData.header as any).totalAmount, 17500);
assert.equal((result.normalizedData.packageInfo as any).totalPackage, 21);
assert.equal((result.normalizedData.goodsLines as any[])[0].quantity, 25000);
assert.equal((result.normalizedData.goodsLines as any[])[0].lineTotal, 17500);
assert.equal((result.normalizedData.goodsLines as any[])[1].quantity, 1);
assert.equal((result.normalizedData.settingsOwned as any).template, "B");
assert.equal((result.normalizedData.header as any).userNote, "legacy-can-rebuild");
assert.equal((rebuiltNormalizedData.goodsLines as any[])[0].quantity, 1250);
assert.equal((result.sourceTrace["goodsLines.0.quantity"] as any).provenance, "DECLARATION_FIELD_RESOLUTION");
assert.equal((result.sourceTrace["settingsOwned.template"] as any).provenance, "USER_SETTING");

console.log(JSON.stringify({
  event: "foundation-8.6.f6-write-authority-boundary.contract.passed",
  preservedPaths: result.preservedPaths,
  acceptance: {
    persistedF6ProvenanceDefinesOwnership: owned.length === 6,
    legacyNormalizeCannotOverwriteF6Header: (result.normalizedData.header as any).totalAmount === 17500,
    legacyNormalizeCannotOverwriteF6Package: (result.normalizedData.packageInfo as any).totalPackage === 21,
    legacyNormalizeCannotOverwriteF6GoodsQuantity: (result.normalizedData.goodsLines as any[])[0].quantity === 25000,
    legacyNormalizeCannotOverwriteF6GoodsAmount: (result.normalizedData.goodsLines as any[])[0].lineTotal === 17500,
    legacyNormalizeCannotOverwriteSecondF6GoodsRow: (result.normalizedData.goodsLines as any[])[1].quantity === 1,
    nonF6OwnedDataRemainsRebuildable: (result.normalizedData.settingsOwned as any).template === "B",
    boundaryDoesNotMutateInputs: (rebuiltNormalizedData.goodsLines as any[])[0].quantity === 1250
  },
  guardrails: {
    foundation6RemainsResolvedFieldWriter: true,
    ownershipDerivedFromPersistedProvenance: true,
    blanketNormalizedDataFreeze: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    modelOrOcrRequired: false,
    directFoundation8NormalizedWrite: false
  }
}, null, 2));
