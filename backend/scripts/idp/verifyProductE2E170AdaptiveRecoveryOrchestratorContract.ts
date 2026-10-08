import assert from "node:assert/strict";
import { planInvoiceAdaptiveRecovery, InvoiceRecoveryTool } from "../../src/modules/idp/llm/invoiceAdaptiveRecoveryOrchestrator.js";
import { INVOICE_ADAPTIVE_RECOVERY_SKILL, INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION } from "../../src/modules/idp/llm/invoiceAdaptiveRecoverySkill.js";

const plan = planInvoiceAdaptiveRecovery({
  version: "1",
  fields: {
    invoiceNo: [{ candidateId: "i", field: "invoiceNo", value: "X-1", confidence: 1, extractor: "test", evidence: [] }],
    "goodsLines.0.quantity": [{ candidateId: "q", field: "goodsLines.0.quantity", value: 25000, confidence: 1, extractor: "test", evidence: [] }],
    "goodsLines.0.unitPrice": [{ candidateId: "p", field: "goodsLines.0.unitPrice", value: 0.7, confidence: 1, extractor: "test", evidence: [] }],
    "goodsLines.0.lineTotal": [{ candidateId: "t", field: "goodsLines.0.lineTotal", value: 17500, confidence: 1, extractor: "test", evidence: [] }],
    "goodsLines.0.hsCode": [{ candidateId: "h", field: "goodsLines.0.hsCode", value: "330499", confidence: 1, extractor: "test", evidence: [] }],
    grossWeight: [{ candidateId: "g", field: "grossWeight", value: 25000, confidence: 1, extractor: "test", evidence: [] }]
  }
});

assert.equal(INVOICE_ADAPTIVE_RECOVERY_SKILL_VERSION, "invoice-adaptive-recovery-v1");
assert.match(INVOICE_ADAPTIVE_RECOVERY_SKILL, /Foundation 6 remains the only resolution\/validation\/promotion authority/);
assert.equal(plan.mode, "SHADOW");
assert.equal(plan.mutatesCandidates, false);
assert.equal(plan.writesNormalizedData, false);
assert.equal(plan.foundation6Authoritative, true);
assert.ok(plan.actions.some((a) => a.tool === InvoiceRecoveryTool.SCALAR_EVIDENCE && a.fields.includes("currency")));
assert.ok(plan.actions.some((a) => a.reason === "NUMERIC_ROLE_COLLISION" && a.fields.includes("grossWeight")));
assert.ok(plan.actions.some((a) => a.tool === InvoiceRecoveryTool.GOODS_TABLE_EVIDENCE && a.fields.includes("goodsLines.0.hsCode")));
assert.ok(!/eryem|dermeternal|ningbo|volta|p0087|26020/i.test(INVOICE_ADAPTIVE_RECOVERY_SKILL));

console.log(JSON.stringify({
  event: "product-e2e-1.7.0.adaptive-recovery-orchestrator.contract.passed",
  plan,
  guardrails: {
    shadowOnly: true,
    minimalToolRouting: true,
    reusableVersionedSkill: true,
    foundation6StillAuthoritative: true,
    extraControlAgentIntroduced: false,
    supplierSpecificRules: false,
    directNormalizedWrite: false
  }
}, null, 2));
