import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts", "utf8");
const bridge = fs.readFileSync("backend/src/modules/idp/understanding/invoiceUnderstandingSpecialistCandidateBridge.ts", "utf8");
const fusion = fs.readFileSync("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");
const diagnostic = fs.readFileSync("backend/scripts/idp/exportFoundation8RunDiagnostics.ts", "utf8");

const acceptance = {
  emptyIssuesArrayMayBeOmitted: provider.includes("const parsedIssues = Array.isArray(parsed.issues) ? parsed.issues : []"),
  fieldsRemainMandatory: provider.includes("contract incomplete: fields missing"),
  transientTransportGetsOneRetry: provider.includes("attempt <= 2") && provider.includes("foundation8_text_specialist.transport_retry"),
  domainLocalPromotionExists: bridge.includes("promotableDomains") && fusion.includes("foundation8PromotableDomains"),
  failedOrReviewDomainIsNotPromotable: fusion.includes('item.status === "COMPLETED" && item.response?.decision !== "REVIEW_REQUIRED"'),
  goodsCanStillFailClosedIndependently: bridge.includes('if (!domains.has("GOODS")) return out'),
  f6RemainsFinalCandidatePath: fusion.includes("overlayReconciledFoundation8Candidates(finalRoleGuardedCandidates, foundation8ReconciledCandidates)"),
  diagnosticUsesPersistedRunsWithoutInference: diagnostic.includes('ProcessingRunModel.find({ status: "COMPLETED" })') && diagnostic.includes("run.candidates as any") && !diagnostic.includes("extractInvoice("),
  diagnosticResolvesRealUploadFilename: diagnostic.includes("UploadedFileModel.findById(run.uploadedFileId)")
};
for (const [name, ok] of Object.entries(acceptance)) assert.equal(ok, true, name);
const guardrails = {
  supplierSpecificRules: /CELIKEL|VED2026|YEM2026|VOLTA|NINGBO|DERMETERNAL|PERMANENT MAGNETS/i.test(provider + bridge + fusion),
  goldenCorpusImportedAtRuntime: /goldenCorpus|golden\/foundation8/i.test(provider + bridge + fusion),
  directNormalizedWrite: /normalizedData\s*=|\.normalizedData\s*=/.test(bridge + fusion)
};
assert.equal(guardrails.supplierSpecificRules, false);
assert.equal(guardrails.goldenCorpusImportedAtRuntime, false);
assert.equal(guardrails.directNormalizedWrite, false);
console.log(JSON.stringify({ event: "foundation-8.17.specialist-reliability-partial-promotion.contract.passed", acceptance, guardrails }, null, 2));
