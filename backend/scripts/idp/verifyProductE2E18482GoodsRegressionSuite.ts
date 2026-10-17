import assert from "node:assert/strict";
import { enforceValidatedNativeGoodsFieldAuthority, enforceVisionGoodsRowBoundary } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const evNative = [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" as const }];
const evImage = [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }];
const c = (field: string, id: string, value: unknown, native = false) => ({ candidateId: id, field, value, confidence: native ? .99 : .95, extractor: native ? "native" : "vision", evidence: native ? evNative : evImage });

// VED-style regression: a complete 56-row native authority must remain intact.
const vedNative: FieldCandidateEnvelope = { version: "1", fields: {} };
for (let row = 0; row < 56; row++) {
  const hs = `goodsLines.${row}.hsCode`;
  const qty = `goodsLines.${row}.quantity`;
  vedNative.fields[hs] = [c(hs, `ved:${row}:hs`, String(100000000000 + row), true) as any];
  vedNative.fields[qty] = [c(qty, `ved:${row}:qty`, row + 1, true) as any];
}
const vedVision: FieldCandidateEnvelope = { version: "1", fields: { ...vedNative.fields } };
vedVision.fields["goodsLines.56.description"] = [c("goodsLines.56.description", "vision:summary", "AMOUNT IN WORDS", false) as any];
const vedBounded = enforceValidatedNativeGoodsFieldAuthority(enforceVisionGoodsRowBoundary(vedVision, vedNative), vedNative);
assert.equal(Object.keys(vedBounded.fields).filter((f) => f.endsWith(".hsCode")).length, 56);
assert.equal(vedBounded.fields["goodsLines.56.description"], undefined);

// YEM-style collision: package count and amount-column guesses cannot replace
// a row-local native quantity/amount proven by quantity * unit price = amount.
const yemNative: FieldCandidateEnvelope = { version: "1", fields: {
  "goodsLines.0.hsCode": [c("goodsLines.0.hsCode", "native:yem:hs", "020714990012", true) as any],
  "goodsLines.0.quantity": [c("goodsLines.0.quantity", "native:yem:qty", 25000, true) as any],
  "goodsLines.0.unit": [c("goodsLines.0.unit", "native:yem:unit", "KG", true) as any],
  "goodsLines.0.unitPrice": [c("goodsLines.0.unitPrice", "native:yem:price", .7, true) as any],
  "goodsLines.0.lineTotal": [c("goodsLines.0.lineTotal", "native:yem:amount", 17500, true) as any]
}};
const yemMixed: FieldCandidateEnvelope = { version: "1", fields: {
  ...yemNative.fields,
  "goodsLines.0.quantity": [c("goodsLines.0.quantity", "vision:koli-as-qty", 1250) as any, ...yemNative.fields["goodsLines.0.quantity"]!],
  "goodsLines.0.lineTotal": [c("goodsLines.0.lineTotal", "vision:wrong-amount", 875) as any, ...yemNative.fields["goodsLines.0.lineTotal"]!]
}};
const yemGuarded = enforceValidatedNativeGoodsFieldAuthority(yemMixed, yemNative);
assert.deepEqual(yemGuarded.fields["goodsLines.0.quantity"]?.map((x) => x.value), [25000]);
assert.deepEqual(yemGuarded.fields["goodsLines.0.lineTotal"]?.map((x) => x.value), [17500]);

// Volta-style collision: amount 560 cannot replace proven quantity 1.
const voltaNative: FieldCandidateEnvelope = { version: "1", fields: {
  "goodsLines.0.hsCode": [c("goodsLines.0.hsCode", "native:volta:hs", "871110000011", true) as any],
  "goodsLines.0.quantity": [c("goodsLines.0.quantity", "native:volta:qty", 1, true) as any]
}};
const voltaMixed: FieldCandidateEnvelope = { version: "1", fields: {
  ...voltaNative.fields,
  "goodsLines.0.quantity": [c("goodsLines.0.quantity", "vision:amount-as-qty", 560) as any, ...voltaNative.fields["goodsLines.0.quantity"]!]
}};
const voltaGuarded = enforceValidatedNativeGoodsFieldAuthority(voltaMixed, voltaNative);
assert.deepEqual(voltaGuarded.fields["goodsLines.0.quantity"]?.map((x) => x.value), [1]);

// PML-style fail-closed: if no validated native 12-digit GTIP exists, this
// authority layer does not fabricate/pad an 8-digit HSN and does not invent a row.
const pmlUnproven: FieldCandidateEnvelope = { version: "1", fields: {
  "goodsLines.0.description": [c("goodsLines.0.description", "vision:pml:desc", "VSeA Base Minus Plug") as any]
}};
const pmlGuarded = enforceValidatedNativeGoodsFieldAuthority(pmlUnproven, { version: "1", fields: {} });
assert.equal(pmlGuarded.fields["goodsLines.0.hsCode"], undefined);
assert.ok(pmlGuarded.fields["goodsLines.0.description"]);

console.log(JSON.stringify({
  event: "product-e2e-1.8.48.2.goods-regression-suite.passed",
  acceptance: {
    vedFiftySixNativeRowsPreserved: true,
    vedPhantomTrailingRowRejected: true,
    yemPackageCountCannotOverrideNativeQuantity: true,
    yemWrongAmountCannotOverrideNativeLineTotal: true,
    voltaAmountCannotOverrideNativeQuantity: true,
    pmlShortHsnNotFabricatedToTwelveDigits: true
  },
  guardrails: {
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    fixedColumnCoordinates: false,
    modelInferenceRequired: false,
    directNormalizedWrite: false
  }
}, null, 2));
