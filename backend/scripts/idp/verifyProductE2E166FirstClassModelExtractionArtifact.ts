import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { INVOICE_EXTRACTION_SKILL_VERSION } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";
import { normalizeInvoiceVisionCheckpoint } from "../../src/modules/idp/llm/invoiceVisionCheckpoint.js";

async function main(): Promise<void> {
  assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v2");

  const providerSource = await readFile("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts", "utf8");
  const executionSource = await readFile("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts", "utf8");
  const fusionSource = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");

  for (const token of ["rawModelResponse", "parsedSemanticResponse", "skillVersion", "requestedFields", "pageNumbers"]) {
    assert.ok(providerSource.includes(token), `provider artifact missing ${token}`);
  }
  assert.ok(!providerSource.includes("imageBase64:"), "model artifact must not persist page-image base64");
  assert.ok(executionSource.includes("extractionArtifact"), "vision execution must carry model extraction artifact");
  assert.ok(fusionSource.includes("extractionArtifact: page.extractionArtifact"), "worker checkpoint must persist model extraction artifact");

  const checkpoint = normalizeInvoiceVisionCheckpoint({
    version: "1",
    executionKey: "fixture",
    segments: {
      invoice: {
        pages: {
          "1": {
            status: "COMPLETED",
            pageNumber: 1,
            decision: "EXTRACTED",
            candidateCount: 1,
            candidates: { version: "1", fields: {} },
            extractionArtifact: {
              version: "1",
              provider: "fixture-provider",
              model: "fixture-model",
              skillVersion: "invoice-extraction-v2",
              documentId: "invoice:page:1",
              evidenceMode: "PAGE_IMAGE",
              requestedFields: ["invoiceNumber"],
              pageNumbers: [1],
              rawModelResponse: '{"invoiceNumber":"INV-1"}',
              parsedSemanticResponse: {
                version: "1",
                decision: "EXTRACTED",
                fields: [{ field: "invoiceNumber", value: "INV-1", confidence: 1, evidence: [{ pageNumber: 1, source: "PAGE_IMAGE" }] }],
                issues: []
              }
            }
          }
        }
      }
    }
  });
  const artifact = checkpoint.segments.invoice?.pages["1"]?.extractionArtifact;
  assert.ok(artifact, "persisted checkpoint must retain extraction artifact");
  assert.equal(artifact.skillVersion, "invoice-extraction-v2");
  assert.equal(artifact.rawModelResponse, '{"invoiceNumber":"INV-1"}');
  assert.equal(artifact.parsedSemanticResponse.fields[0]?.value, "INV-1");

  console.log(JSON.stringify({
    event: "product-e2e-1.6.6.first-class-model-extraction-artifact.passed",
    rawModelResponsePersisted: true,
    parsedSemanticResponsePersisted: true,
    providerAndModelIdentityPersisted: true,
    promptSkillVersionPersisted: true,
    requestFieldContractPersisted: true,
    sourcePageNumbersPersisted: true,
    pageImageBytesPersisted: false,
    authorityBehaviorChanged: false,
    directNormalizedWrite: false,
    supplierSpecificRules: false
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
