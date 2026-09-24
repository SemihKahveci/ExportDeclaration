import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.model.js";
import { DeclarationLlmAssistRunModel } from "../../src/modules/idp/domain/declarationLlmAssistRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { tryOrchestrateDeclarationLlmAssistAfterProcessing } from "../../src/modules/idp/llm/declarationLlmAssistLifecycle.service.js";
import { probeQwenRuntimeReadiness } from "../../src/modules/idp/llm/qwenRuntimeReadiness.js";
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";

function runPython(script: string, output: string, ...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [script, output, ...args], {
      cwd: path.dirname(script), env: process.env, windowsHide: true
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`fixture generator exit=${code}: ${stderr.trim()}`)));
  });
}

async function createRun(
  companyId: mongoose.Types.ObjectId,
  declarationId: mongoose.Types.ObjectId,
  type: string,
  fileName: string,
  filePath: string
) {
  const bytes = await fs.readFile(filePath);
  const uploaded = await UploadedFileModel.create({
    companyId, declarationId, type, fileName, filePath,
    mimeType: "application/pdf", size: bytes.length,
    extractionStatus: "PENDING", parseErrors: []
  });
  const run = await ProcessingRunModel.create({
    companyId, declarationId, uploadedFileId: uploaded._id,
    status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
    attempt: 0, processorVersion: "verify-8.7-real-local-qwen"
  });
  return { uploaded, run };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-8.7-"));
  const invoicePath = path.join(tempDir, "invoice.pdf");
  const packingPath = path.join(tempDir, "packing-list-conflict.pdf");
  const oldEnv = {
    llmEnabled: env.llmEnabled,
    llmBaseUrl: env.llmBaseUrl,
    llmModel: env.llmModel,
    llmTimeoutMs: env.llmTimeoutMs,
    llmApiKey: env.llmApiKey
  };

  try {
    // This verifier deliberately targets the Windows-host Ollama runtime from
    // Docker Desktop. Optional env overrides keep the test portable without
    // changing the production LLM contract.
    Object.assign(env, {
      llmEnabled: true,
      llmBaseUrl: process.env.FOUNDATION_87_QWEN_BASE_URL || "http://host.docker.internal:11434",
      llmModel: process.env.FOUNDATION_87_QWEN_MODEL || "qwen3:8b",
      llmTimeoutMs: Number(process.env.FOUNDATION_87_QWEN_TIMEOUT_MS || 180000),
      llmApiKey: process.env.FOUNDATION_87_QWEN_API_KEY || ""
    });

    const readiness = await probeQwenRuntimeReadiness();
    assert.equal(readiness.status, "READY", `real Qwen runtime is not ready: ${JSON.stringify(readiness)}`);
    if (readiness.status !== "READY") throw new Error("unreachable");
    assert(readiness.advertisedModelIds.includes(env.llmModel));

    await runPython(path.join(env.invoiceParserDir, "create_foundation_613_fixture.py"), invoicePath);
    await runPython(path.join(env.invoiceParserDir, "create_foundation_77_packing_fixture.py"), packingPath, "3");

    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      normalizedData: {},
      idpIntelligencePolicy: {
        version: "1",
        coverageProfile: {
          version: "1",
          requirements: [
            { documentType: DocumentType.INVOICE, required: true, minCount: 1, maxCount: 1 },
            { documentType: DocumentType.PACKING_LIST, required: true, minCount: 1, maxCount: 1 }
          ]
        },
        consistencyProfile: {
          version: "1",
          rules: [{
            field: "goodsLines.0.quantity",
            documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],
            comparator: { kind: "NUMERIC_TOLERANCE", absoluteTolerance: 0 },
            requireAllDocumentTypes: true
          }]
        }
      },
      idpLlmAssistPolicy: { version: "1", enabled: true, autoApplyResolvedAuthority: true }
    });

    const invoice = await createRun(companyId, declarationId, DocumentType.INVOICE, "foundation-8.7-invoice.pdf", invoicePath);
    await processIdpJob(String(invoice.run._id));
    assert.equal(await DeclarationLlmAssistRunModel.countDocuments({ companyId, declarationId }), 0,
      "insufficient evidence must not call/persist real Qwen assistance");

    const beforeConflict = await DeclarationModel.findById(declarationId).lean();
    const quantityBeforeConflict = (beforeConflict?.normalizedData as any)?.goodsLines?.[0]?.quantity;
    const quantityTraceBeforeConflict = (beforeConflict?.sourceTrace as any)?.["goodsLines.0.quantity"];
    assert.equal(quantityBeforeConflict, 2, "invoice baseline quantity must already be promoted before the conflict arrives");

    const packing = await createRun(companyId, declarationId, DocumentType.PACKING_LIST, "foundation-8.7-packing.pdf", packingPath);
    await processIdpJob(String(packing.run._id));

    const declaration = await DeclarationModel.findById(declarationId).lean();
    assert.equal(declaration?.idpIntelligence?.status, "REVIEW_REQUIRED");
    assert(declaration?.idpLlmAssist, "grounded conflict must persist a real Qwen assistance run");
    assert.equal(declaration?.idpLlmAssist?.model, env.llmModel);
    assert.equal(declaration?.idpLlmAssist?.provider, "qwen-openai-compatible");

    const assistRuns = await DeclarationLlmAssistRunModel.find({ companyId, declarationId }).lean();
    assert.equal(assistRuns.length, 1);
    const assist = assistRuns[0];
    assert.equal(assist.response.model, env.llmModel);
    assert.equal(assist.response.provider, "qwen-openai-compatible");
    assert(["RESOLVED", "REVIEW_REQUIRED"].includes(assist.response.decision));

    let authorityApplied = false;
    let selectedExistingCandidate = false;
    if (assist.response.decision === "RESOLVED") {
      assert.equal(assist.response.selections.length, 1);
      const selection = assist.response.selections[0];
      const requestedField = assist.request.fields.find((field: any) => field.field === selection.field);
      assert(requestedField, "real Qwen may select only a requested conflict field");
      const selected = requestedField.candidates.find((candidate: any) => candidate.candidateId === selection.candidateId);
      assert(selected, "real Qwen may select only an existing persisted candidateId");
      selectedExistingCandidate = true;

      const trace = (declaration?.sourceTrace as any)?.[selection.field];
      assert.equal(trace?.candidateId, selection.candidateId);
      assert.equal(trace?.provenance, "DECLARATION_FIELD_RESOLUTION");
      assert.deepEqual((declaration?.normalizedData as any)?.goodsLines?.[0]?.quantity, selected.value);
      authorityApplied = true;
    } else {
      assert.equal(assist.response.selections.length, 0, "REVIEW_REQUIRED must remain fail-closed with zero selections");
      assert.equal((declaration?.normalizedData as any)?.goodsLines?.[0]?.quantity, quantityBeforeConflict,
        "unresolved real-Qwen conflict must preserve the previously promoted quantity");
      assert.deepEqual((declaration?.sourceTrace as any)?.["goodsLines.0.quantity"], quantityTraceBeforeConflict,
        "unresolved real-Qwen conflict must preserve the previously promoted quantity provenance");
    }

    const resolutionRunsBeforeReplay = await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId });
    const replay = await tryOrchestrateDeclarationLlmAssistAfterProcessing({ companyId, declarationId });
    assert.equal(replay.reusedAssistRun, true, "exact replay must reuse the persisted real-Qwen assist run without another inference");
    assert.equal(await DeclarationLlmAssistRunModel.countDocuments({ companyId, declarationId }), 1);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId }), resolutionRunsBeforeReplay,
      "exact replay must not create another Foundation 6 resolution run");

    if (assist.response.decision === "RESOLVED") {
      assert.equal(replay.status, "AUTHORITY_APPLIED");
      if (replay.status !== "AUTHORITY_APPLIED") throw new Error("unreachable");
      assert.equal(replay.reusedResolutionRun, true);
    } else {
      assert.equal(replay.status, "ASSISTED");
      if (replay.status !== "ASSISTED") throw new Error("unreachable");
      assert.equal(replay.decision, "REVIEW_REQUIRED");
      assert.equal(replay.authorityApplied, false);
    }

    console.log(JSON.stringify({
      event: "foundation-8.7.real-local-qwen-e2e.passed",
      runtime: {
        provider: readiness.provider,
        baseUrl: readiness.baseUrl,
        model: readiness.configuredModel,
        realRuntimeUsed: true,
        mockServerUsed: false
      },
      e2e: {
        productionWorkerFunctionUsed: true,
        realInvoicePdfUsed: true,
        realPackingListPdfUsed: true,
        groundedConflictReachedRealQwen: true,
        realQwenDecision: assist.response.decision,
        realQwenAssistPersisted: true,
        selectedExistingCandidate: assist.response.decision === "RESOLVED" ? selectedExistingCandidate : null,
        authorityAppliedThroughFoundation6: assist.response.decision === "RESOLVED" ? authorityApplied : false,
        exactReplayReusedAssist: true
      },
      guardrails: {
        insufficientEvidenceSkippedBeforeQwen: true,
        hallucinatedCandidateAccepted: false,
        directLlmNormalizedWrite: false,
        reviewRequiredRemainsFailClosed: assist.response.decision === "REVIEW_REQUIRED" ? true : null,
        duplicateAssistRunCreated: false,
        duplicateAuthorityResolutionRunCreated: false
      }
    }, null, 2));
  } finally {
    Object.assign(env, oldEnv);
    await DeclarationLlmAssistRunModel.deleteMany({ declarationId });
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await LogicalDocumentModel.deleteMany({ declarationId });
    await ProcessingRunModel.deleteMany({ declarationId });
    await UploadedFileModel.deleteMany({ declarationId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await fs.rm(tempDir, { recursive: true, force: true });
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
