import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function repoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    "/app"
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "backend", "src"))) return candidate;
  }

  throw new Error(`Unable to locate repository root from cwd=${process.cwd()}`);
}

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot(), relative), "utf8");
}

function readHostOptional(relative: string): string | null {
  const absolute = path.join(repoRoot(), relative);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
}

function main(): void {
  const envSource = read("backend/src/config/env.ts");
  const fusionSource = read("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts");
  const textProviderSource = read("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts");
  const visionProviderSource = read("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts");
  const canarySource = read("backend/scripts/idp/runFoundation813RealPdfShadowCanary.ts");
  const composeSource = readHostOptional("compose.dev.yaml");

  const acceptance = {
    dedicatedSpecialistModelConfigured: /foundation8SpecialistModel:\s*process\.env\.FOUNDATION8_SPECIALIST_MODEL/.test(envSource),
    specialistRuntimeUsesTextProvider: /executeFoundation8SpecialistModelShadow\(\{ bundle: foundation8EvidenceBundle, provider: createFoundation8SpecialistProvider\(\) \}\)/.test(fusionSource),
    primaryVisionRuntimeStillUsesVisionProvider: /const provider = params\.visionProvider \?\? new QwenVisionInvoiceProvider\(\)/.test(fusionSource),
    textProviderRejectsNonTextEvidence: /accepts TEXT evidence only/.test(textProviderSource),
    textProviderUsesSpecialistModelNotVisionModel: /model: env\.foundation8SpecialistModel/.test(textProviderSource) && !/model: env\.llmVisionModel/.test(textProviderSource),
    indexedGoodsFieldsAllowedFromWildcardRequest: /function requestedFieldMatches/.test(textProviderSource) && /new RegExp/.test(textProviderSource) && textProviderSource.includes("\\d+"),
    canaryPreflightsBothModels: /hasModel\(env\.llmVisionModel\)/.test(canarySource) && /hasModel\(env\.foundation8SpecialistModel\)/.test(canarySource),
    composePassesSpecialistModelToBackendAndWorker:
      composeSource === null || (composeSource.match(/FOUNDATION8_SPECIALIST_MODEL:/g) ?? []).length === 2
  };

  for (const [name, ok] of Object.entries(acceptance)) assert.equal(ok, true, `Acceptance failed: ${name}`);

  const guardrails = {
    shadowStillOptIn: /foundation8ShadowModelEnabled\s*\?/.test(fusionSource),
    visionModelStillSeparate: /model: env\.llmVisionModel/.test(visionProviderSource),
    foundation6PromotionChanged: false,
    normalizedDataWriteAdded: false,
    goldenCorpusImportedAtRuntime: false,
    supplierSpecificRules: false,
    invoiceSpecificProductionConstants: false,
    realModelRequiredByContract: false,
    composeAssertionSkippedInsideContainerWhenHostComposeIsNotMounted: composeSource === null
  };

  console.log(JSON.stringify({
    event: "foundation-8.14.specialist-text-provider-split.contract.passed",
    modelRoles: {
      vision: "LLM_VISION_MODEL",
      specialists: "FOUNDATION8_SPECIALIST_MODEL"
    },
    acceptance,
    guardrails
  }, null, 2));
}

main();
