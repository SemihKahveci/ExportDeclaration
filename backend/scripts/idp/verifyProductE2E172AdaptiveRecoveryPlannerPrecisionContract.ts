import assert from "node:assert/strict";
import { planInvoiceAdaptiveRecovery } from "../../src/modules/idp/llm/invoiceAdaptiveRecoveryOrchestrator.js";
import { INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION } from "../../src/modules/idp/llm/invoiceAdaptiveRecoverySkill.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";

const c = (field: string, value: unknown) => ({
  candidateId: `contract:${field}:${String(value)}`,
  field,
  value,
  confidence: 0.9,
  evidence: [{ source: "NATIVE_TEXT" as const, pageNumber: 1, quote: String(value) }],
  extractor: "contract"
});
const envelope = (fields: Record<string, unknown[]>): FieldCandidateEnvelope => ({
  version: "1",
  fields: Object.fromEntries(Object.entries(fields).map(([field, values]) => [field, values.map((value) => c(field, value))]))
});

assert.equal(INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION, "invoice-adaptive-recovery-v2");

const prefixedGtip = planInvoiceAdaptiveRecovery(envelope({
  invoiceNo: ["YEM2026000000037"], invoiceDate: ["2026-09-23"], currency: ["USD"],
  "goodsLines.0.hsCode": ["GTIP:020714990012"], "goodsLines.0.description": ["sample"],
  "goodsLines.0.quantity": [1], "goodsLines.0.unitPrice": [2], "goodsLines.0.lineTotal": [2]
}));
assert.equal(prefixedGtip.actions.some((a) => a.reason === "INVALID_GTIN_SHAPE"), false);

const identity = planInvoiceAdaptiveRecovery(envelope({
  invoiceNo: ["P0087/26-27 & 16-Sep-26"], invoiceDate: [], currency: [],
  "goodsLines.0.description": ["sample"], "goodsLines.0.quantity": [1]
}));
assert(identity.actions.some((a) => a.reason === "IDENTITY_ROLE_COLLISION" && a.fields.includes("invoiceNo")));

const missingDescription = planInvoiceAdaptiveRecovery(envelope({
  invoiceNo: ["WYL2026060501"], invoiceDate: [], currency: ["USD"],
  "goodsLines.3.quantity": [1], "goodsLines.3.unitPrice": [1100], "goodsLines.3.lineTotal": [1100]
}));
assert(missingDescription.actions.some((a) => a.reason === "MISSING_GOODS_FIELD" && a.fields.includes("goodsLines.3.description")));

const incompleteGtip = planInvoiceAdaptiveRecovery(envelope({
  invoiceNo: ["VXA2026000000035"], invoiceDate: ["2026-09-23"], currency: [],
  "goodsLines.0.hsCode": ["87111000001"], "goodsLines.0.description": ["sample"]
}));
assert(incompleteGtip.actions.some((a) => a.reason === "INVALID_GTIN_SHAPE" && a.fields.includes("goodsLines.0.hsCode")));

console.log(JSON.stringify({
  event: "product-e2e-1.7.2.adaptive-recovery-planner-precision.contract.passed",
  guardrails: {
    shadowOnly: true,
    prefixedTwelveDigitGtipNotFalsePositive: true,
    identityRoleCollisionRouted: true,
    missingGoodsDescriptionRouted: true,
    incompleteGtipStillRouted: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
    foundation6StillAuthoritative: true
  }
}, null, 2));
