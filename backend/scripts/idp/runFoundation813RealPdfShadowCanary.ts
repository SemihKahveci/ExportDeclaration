import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";
import { summarizeFoundation8RealPdfCanary } from "../../src/modules/idp/understanding/foundation8RealPdfCanary.js";
import type { CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function ollamaRoot(value: string): string {
  return value.trim().replace(/\/$/, "").replace(/\/v1$/, "");
}

async function preflight(): Promise<{ baseUrl: string; availableModels: string[] }> {
  assert.equal(env.llmEnabled, true, "LLM_ENABLED=true required for a real canary.");
  assert.equal(env.llmVisionEnabled, true, "LLM_VISION_ENABLED=true required for a real canary.");
  assert.equal(env.foundation8ShadowModelEnabled, true, "FOUNDATION8_SHADOW_MODEL_ENABLED=true required for a real canary.");
  assert.ok(env.llmBaseUrl.trim(), "LLM_BASE_URL is required.");
  assert.ok(env.llmVisionModel.trim(), "LLM_VISION_MODEL is required.");
  assert.ok(env.foundation8SpecialistModel.trim(), "FOUNDATION8_SPECIALIST_MODEL is required.");

  const baseUrl = ollamaRoot(env.llmBaseUrl);
  const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) });
  assert.ok(response.ok, `Ollama preflight failed: HTTP ${response.status}`);
  const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
  const availableModels = (payload.models ?? []).flatMap(item => [item.name, item.model]).filter((value): value is string => Boolean(value));
  const hasModel = (configured: string) => availableModels.some(model => model === configured || model.startsWith(`${configured}:`) || configured.startsWith(`${model}:`));
  assert.ok(hasModel(env.llmVisionModel), `Configured LLM_VISION_MODEL '${env.llmVisionModel}' not present in Ollama model list.`);
  assert.ok(hasModel(env.foundation8SpecialistModel), `Configured FOUNDATION8_SPECIALIST_MODEL '${env.foundation8SpecialistModel}' not present in Ollama model list.`);
  return { baseUrl, availableModels: [...new Set(availableModels)].sort() };
}

async function main(): Promise<void> {
  const pdfPath = path.resolve(arg("pdf") ?? "");
  const label = arg("label") ?? path.basename(pdfPath, path.extname(pdfPath));
  const outputPath = path.resolve(arg("output") ?? path.join("tmp", "foundation8-canary", `${label}.json`));
  assert.ok(pdfPath && pdfPath !== path.resolve("."), "Usage: --pdf=/absolute/or/project/path/invoice.pdf [--label=name] [--output=path.json]");
  const stat = await fs.stat(pdfPath);
  assert.ok(stat.isFile() && stat.size > 0, `PDF not found or empty: ${pdfPath}`);
  const head = (await fs.readFile(pdfPath)).subarray(0, 5).toString("ascii");
  assert.equal(head, "%PDF-", `Not a PDF: ${pdfPath}`);

  const modelPreflight = await preflight();
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;
  const startedAt = Date.now();

  try {
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: path.basename(pdfPath), filePath: pdfPath,
      mimeType: "application/pdf", size: stat.size, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: `foundation-${13}-real-pdf-shadow-canary`
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    await processIdpJob(String(run._id));
    const persistedRun = await ProcessingRunModel.findById(run._id).lean();
    assert(persistedRun, "ProcessingRun disappeared during canary.");
    assert.equal(persistedRun.status, ProcessingStatus.COMPLETED, `Canary worker did not complete: ${persistedRun.status}`);
    const extraction = persistedRun.candidates as CandidateExtractionEnvelope | undefined;
    assert.ok(extraction?.segments, "Persisted candidate envelope missing.");
    const shadow = summarizeFoundation8RealPdfCanary(extraction);
    assert.ok(shadow.totals.segmentsWithSpecialistAudit > 0, "No Foundation 8 specialist shadow audit was produced.");
    assert.ok(shadow.totals.modelCallsAttempted >= 4, "Expected at least four bounded specialist model calls.");

    const report = {
      event: "foundation-8.13.real-pdf-shadow-canary.completed",
      label,
      input: { fileName: path.basename(pdfPath), bytes: stat.size },
      runtime: {
        elapsedMs: Date.now() - startedAt,
        llmBaseUrl: modelPreflight.baseUrl,
        primaryVisionModel: env.llmVisionModel,
        specialistModel: env.foundation8SpecialistModel,
        specialistProviderNote: "Foundation 8 specialists use the dedicated text-only Qwen provider; primary page-image extraction remains on LLM_VISION_MODEL.",
        availableModelCount: modelPreflight.availableModels.length
      },
      shadow,
      isolation: {
        temporaryCompanyAndDeclaration: true,
        productionDeclarationIdUsed: false,
        productionCandidatesMutatedByFoundation8: false,
        foundation8NormalizedDataWrite: false,
        goldenExpectedAnswersImported: false,
        cleanupAfterRun: true
      }
    };
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(JSON.stringify({ ...report, outputPath }, null, 2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await LogicalDocumentModel.deleteMany({ declarationId });
    if (processingRunId) await ProcessingRunModel.deleteMany({ _id: processingRunId });
    if (uploadedFileId) await UploadedFileModel.deleteMany({ _id: uploadedFileId });
    await UploadedFileModel.deleteMany({ declarationId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await mongoose.disconnect();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
