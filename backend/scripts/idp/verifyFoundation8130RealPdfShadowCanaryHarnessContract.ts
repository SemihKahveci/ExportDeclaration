import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { summarizeFoundation8RealPdfCanary } from "../../src/modules/idp/understanding/foundation8RealPdfCanary.js";
import type { CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";

async function main(): Promise<void> {
  const extraction = {
    version: "1",
    segments: [{
      segmentId: "seg-1", documentType: "INVOICE", status: "EXTRACTED", pageNumbers: [1],
      data: {
        fieldCandidates: { version: "1", fields: { "header.invoiceNo": [{ candidateId: "legacy", field: "header.invoiceNo", value: "LEGACY", confidence: 1, source: "NATIVE_TEXT", evidence: [] }] } },
        foundation8SpecialistModelAudit: {
          modelCallsAttempted: 4, totalElapsedMs: 120,
          specialists: ["PARTIES", "COMMERCIAL", "GOODS", "LOGISTICS"].map((domain, index) => ({ domain, status: "COMPLETED", decision: "ACCEPT", elapsedMs: 20 + index, returnedFieldCount: 2, acceptedOwnedFieldCount: 2, rejectedOutOfDomainFields: [] }))
        },
        foundation8SpecialistReconciliationAudit: {
          action: "ACCEPT", issueCodes: [], recoveryDomains: [], recoveryRowIds: [],
          result: { understanding: { goodsTable: { rows: [{ rowId: "model-row-0-p1", rowEvidence: [{ pageNumber: 1, source: "NATIVE_TEXT", quote: "Widget 25 KG 17,500" }], productCode: { value: "W1" }, description: { value: "Widget" }, quantity: { value: 25000 }, unit: { value: "KG" }, lineTotal: { value: 17500 } }] } } }
        }
      }
    }]
  } as unknown as CandidateExtractionEnvelope;

  const before = JSON.stringify(extraction);
  const summary = summarizeFoundation8RealPdfCanary(extraction);
  assert.equal(summary.totals.segmentsWithSpecialistAudit, 1);
  assert.equal(summary.totals.modelCallsAttempted, 4);
  assert.equal(summary.totals.atomicGoodsRows, 1);
  assert.equal(summary.totals.completeAtomicGoodsRows, 1);
  assert.equal(summary.totals.actions.ACCEPT, 1);
  assert.equal(JSON.stringify(extraction), before);

  const runner = await fs.readFile(path.join(process.cwd(), "backend/scripts/idp/runFoundation813RealPdfShadowCanary.ts"), "utf8");
  assert.match(runner, /FOUNDATION8_SHADOW_MODEL_ENABLED=true required/);
  assert.match(runner, /\/api\/tags/);
  assert.match(runner, /processIdpJob\(String\(run\._id\)\)/);
  assert.match(runner, /temporaryCompanyAndDeclaration: true/);
  assert.match(runner, /cleanupAfterRun: true/);
  assert.match(runner, /specialistProviderNote: "8\.13 specialists currently share QwenVisionInvoiceProvider/);
  assert.doesNotMatch(runner, /foundation8\/evals|\.expected\.json|goldenCorpus/);

  const modelExecution = await fs.readFile(path.join(process.cwd(), "backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistModelExecution.ts"), "utf8");
  assert.match(modelExecution, /elapsedMs: Date\.now\(\) - specialistStartedAt/);
  assert.match(modelExecution, /totalElapsedMs: Date\.now\(\) - executionStartedAt/);

  console.log(JSON.stringify({
    event: "foundation-8.13.real-pdf-shadow-canary-harness.contract.passed",
    acceptance: {
      canarySummarizesPersistedSpecialistAudit: true,
      atomicGoodsCompletenessReported: true,
      perSpecialistTimingReported: true,
      realRunnerUsesProductionWorker: true,
      modelAvailabilityPreflightRequired: true,
      temporaryDatabaseIsolationDeclared: true,
      goldenAnswersExcludedFromRuntime: true,
      currentSpecialistModelIdentityMadeExplicit: true,
      summaryDoesNotMutateExtraction: true
    },
    guardrails: {
      productionCutover: false,
      foundation6PromotionChanged: false,
      normalizedDataWriteAddedByFoundation8: false,
      supplierSpecificRuntimeRules: false,
      invoiceSpecificProductionConstants: false,
      realModelRequiredByContract: false
    }
  }, null, 2));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
