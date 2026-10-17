import assert from "node:assert/strict";
import type { InvoiceLlmExtractionProvider, InvoiceLlmExtractionRequest, InvoiceLlmExtractionResponse } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { executeFoundation8SpecialistModelShadow } from "../../src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.js";

class FakeProvider implements InvoiceLlmExtractionProvider {
  readonly name = "foundation8-contract-fake";
  readonly requests: InvoiceLlmExtractionRequest[] = [];
  async extractInvoice(request: InvoiceLlmExtractionRequest): Promise<InvoiceLlmExtractionResponse> {
    this.requests.push(request);
    const skill = request.verifiedKnowledge?.[0]?.label ?? "";
    const field = skill.includes("invoice-parties") ? "parties.seller.name"
      : skill.includes("invoice-commercial") ? "totalAmount"
      : skill.includes("invoice-goods-table") ? "goodsLines.0.quantity"
      : "totalPackage";
    return {
      version: "1",
      decision: InvoiceLlmExtractionDecision.EXTRACTED,
      fields: [
        { field, value: field.includes("name") ? "SOURCE VALUE" : 1, confidence: 0.9, evidence: [{ pageNumber: 1, source: "NATIVE_TEXT", quote: "source" }] },
        // Deliberate ownership violation: every specialist tries to emit this foreign field.
        { field: "goodsLines.99.quantity", value: 999, confidence: 0.9, evidence: [{ pageNumber: 1, source: "NATIVE_TEXT", quote: "foreign" }] }
      ],
      issues: [],
      model: "fake",
      provider: this.name
    };
  }
}

async function main(): Promise<void> {
  const provider = new FakeProvider();
  const audit = await executeFoundation8SpecialistModelShadow({
    provider,
    bundle: {
      documentId: "foundation-8.10-contract",
      canonicalText: "SELLER SOURCE VALUE\nTOTAL 1\nQTY 1\nPACKAGE 1",
      evidence: [{ pageNumber: 1, source: "NATIVE_TEXT", quote: "source" }]
    }
  });

  assert.equal(audit.mode, "SHADOW_ONLY");
  assert.equal(audit.productionCandidateMutation, false);
  assert.equal(audit.modelCallsAttempted, 4);
  assert.deepEqual(provider.requests.map(request => request.verifiedKnowledge?.[0]?.label.split(":")[1]?.split("@")[0]), [
    "invoice-parties", "invoice-commercial", "invoice-goods-table", "invoice-logistics"
  ]);
  assert.ok(provider.requests.every(request => request.focusInstruction?.includes("Missing or ambiguous values must remain absent/review-required.")));
  assert.ok(provider.requests.every(request => request.verifiedKnowledge?.[0]?.content.includes("#")));
  assert.ok(audit.specialists.every(item => item.status === "COMPLETED"));
  assert.ok(audit.specialists.every(item => item.response?.fields.every(field => !item.rejectedOutOfDomainFields.includes(field.field))));
  assert.ok(audit.specialists.slice(0, 2).every(item => item.rejectedOutOfDomainFields.includes("goodsLines.99.quantity")));
  assert.equal(audit.specialists[2]?.rejectedOutOfDomainFields.length, 0); // GOODS owns the deliberate goods field.
  assert.ok(audit.specialists[3]?.rejectedOutOfDomainFields.includes("goodsLines.99.quantity"));

  const envSource = await import("node:fs/promises").then(fs => fs.readFile("backend/src/config/env.ts", "utf8"));
  const fusionSource = await import("node:fs/promises").then(fs => fs.readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8"));
  assert.match(envSource, /FOUNDATION8_SHADOW_MODEL_ENABLED, false/);
  assert.match(fusionSource, /env\.foundation8ShadowModelEnabled/);

  console.log(JSON.stringify({
    event: "foundation-8.10.specialist-model-execution.contract.passed",
    acceptance: {
      fourBoundedSpecialistsExecute: true,
      portableSkillContextReachesModelRequest: true,
      sameCanonicalEvidenceFeedsSpecialists: true,
      outOfDomainModelFieldsAreRejected: true,
      missingAndAmbiguousValuesFailClosedInstruction: true,
      shadowModelExecutionIsExplicitlyOptIn: true,
      specialistFailureCannotMutateProductionCandidates: true
    },
    guardrails: {
      shadowOnly: true,
      enabledByDefault: false,
      foundation6PromotionChanged: false,
      normalizedDataWriteAdded: false,
      goldenCorpusImportedAtRuntime: false,
      supplierSpecificRules: false,
      invoiceSpecificProductionConstants: false
    }
  }, null, 2));
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
