import assert from "node:assert/strict";
import { evidenceBoundGoodsNumericValue } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

// Synthetic, corpus-neutral examples: evidence role outranks arithmetic coincidence.
const packageAsQuantity = {
  quantity: 48,
  evidence: { quantity: { header: "Carton", rawValue: "48", unit: "CTN" } }
};
assert.equal(evidenceBoundGoodsNumericValue(packageAsQuantity as never, "quantity"), null);

const visibleCommercialQuantity = {
  quantity: 48,
  evidence: { quantity: { header: "Quantity", rawValue: "2.400", unit: "KG" } }
};
assert.equal(evidenceBoundGoodsNumericValue(visibleCommercialQuantity as never, "quantity"), 2400);

const arithmeticRepairMustLose = {
  lineTotal: 336,
  evidence: { lineTotal: { header: "Line Total", rawValue: "16.800,00 EUR" } }
};
assert.equal(evidenceBoundGoodsNumericValue(arithmeticRepairMustLose as never, "lineTotal"), 16800);

const shipmentWeightAsPrice = {
  unitPrice: 7250,
  evidence: { unitPrice: { header: "Gross Weight KG", rawValue: "7.250" } }
};
assert.equal(evidenceBoundGoodsNumericValue(shipmentWeightAsPrice as never, "unitPrice"), null);

const noEvidenceKeepsSemanticPath = { unitPrice: 7.5 };
assert.equal(evidenceBoundGoodsNumericValue(noEvidenceKeepsSemanticPath as never, "unitPrice"), 7.5);

console.log({
  event: "foundation-8.25.4.semantic-evidence-role-guard.contract.passed",
  explicitEvidenceOverridesDerivedNumeric: true,
  contradictoryRoleFailsClosed: true,
  evidenceAbsentPreservesBaseline: true,
  corpusSpecificRules: false
});
