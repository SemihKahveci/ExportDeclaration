import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import { AddressInfo } from "node:net";
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
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";

function runPython(script: string, output: string, ...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [script, output, ...args], { cwd: path.dirname(script), env: process.env, windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`fixture generator exit=${code}: ${stderr.trim()}`)));
  });
}

async function createRun(companyId: mongoose.Types.ObjectId, declarationId: mongoose.Types.ObjectId, type: string, fileName: string, filePath: string) {
  const bytes = await fs.readFile(filePath);
  const uploaded = await UploadedFileModel.create({ companyId, declarationId, type, fileName, filePath, mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: [] });
  const run = await ProcessingRunModel.create({ companyId, declarationId, uploadedFileId: uploaded._id, status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST, attempt: 0, processorVersion: "verify-8.5-worker-llm-lifecycle" });
  return { uploaded, run };
}

async function startMock() {
  let requests = 0;
  const server = http.createServer(async (req, res) => {
    requests += 1;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const request = JSON.parse(body.messages?.[1]?.content ?? "{}");
    const field = request.fields?.find((item: any) => item.field === "goodsLines.0.quantity");
    const packing = field?.candidates?.find((candidate: any) => candidate.documentType === DocumentType.PACKING_LIST);
    assert(packing?.candidateId, "mock must receive persisted PACKING_LIST candidateId");
    const content = JSON.stringify({ version: "1", decision: "RESOLVED", selections: [{ field: "goodsLines.0.quantity", candidateId: packing.candidateId }], issues: [] });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, requests: () => requests, close: () => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())) };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-8.5-"));
  const invoicePath = path.join(tempDir, "invoice.pdf");
  const packingPath = path.join(tempDir, "packing-list-conflict.pdf");
  const mock = await startMock();
  const oldEnv = { llmEnabled: env.llmEnabled, llmBaseUrl: env.llmBaseUrl, llmModel: env.llmModel, llmTimeoutMs: env.llmTimeoutMs, llmApiKey: env.llmApiKey };

  try {
    Object.assign(env, { llmEnabled: true, llmBaseUrl: mock.baseUrl, llmModel: "qwen-foundation-8.5-mock", llmTimeoutMs: 2000, llmApiKey: "" });
    await runPython(path.join(env.invoiceParserDir, "create_foundation_613_fixture.py"), invoicePath);
    await runPython(path.join(env.invoiceParserDir, "create_foundation_77_packing_fixture.py"), packingPath, "3");

    await DeclarationModel.create({
      _id: declarationId, companyId, status: "DRAFT", normalizedData: {},
      idpIntelligencePolicy: {
        version: "1",
        coverageProfile: { version: "1", requirements: [
          { documentType: DocumentType.INVOICE, required: true, minCount: 1, maxCount: 1 },
          { documentType: DocumentType.PACKING_LIST, required: true, minCount: 1, maxCount: 1 }
        ] },
        consistencyProfile: { version: "1", rules: [{ field: "goodsLines.0.quantity", documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST], comparator: { kind: "NUMERIC_TOLERANCE", absoluteTolerance: 0 }, requireAllDocumentTypes: true }] }
      },
      idpLlmAssistPolicy: { version: "1", enabled: true, autoApplyResolvedAuthority: true }
    });

    const invoice = await createRun(companyId, declarationId, DocumentType.INVOICE, "foundation-8.5-invoice.pdf", invoicePath);
    await processIdpJob(String(invoice.run._id));
    assert.equal(mock.requests(), 0, "missing PACKING_LIST is insufficient evidence and must not call Qwen");

    const packing = await createRun(companyId, declarationId, DocumentType.PACKING_LIST, "foundation-8.5-packing.pdf", packingPath);
    await processIdpJob(String(packing.run._id));

    assert.equal(mock.requests(), 1, "grounded conflict must call Qwen exactly once");
    const declaration = await DeclarationModel.findById(declarationId).lean();
    assert.equal(declaration?.idpIntelligence?.status, "REVIEW_REQUIRED");
    assert.equal(declaration?.idpLlmAssist?.decision, "RESOLVED");
    assert.equal((declaration?.normalizedData as any)?.goodsLines?.[0]?.quantity, 3);
    const trace = (declaration?.sourceTrace as any)?.["goodsLines.0.quantity"];
    assert.equal(trace?.candidateId, declaration?.idpLlmAssist?.selections?.[0]?.candidateId);
    assert.equal(trace?.provenance, "DECLARATION_FIELD_RESOLUTION");

    const assistRuns = await DeclarationLlmAssistRunModel.find({ companyId, declarationId }).lean();
    assert.equal(assistRuns.length, 1);
    const resolutionRunsBeforeReplay = await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId });
    const replay = await tryOrchestrateDeclarationLlmAssistAfterProcessing({ companyId, declarationId });
    assert.equal(replay.status, "AUTHORITY_APPLIED");
    if (replay.status !== "AUTHORITY_APPLIED") throw new Error("unreachable");
    assert.equal(replay.reusedAssistRun, true);
    assert.equal(replay.reusedResolutionRun, true);
    assert.equal(mock.requests(), 1, "exact replay must reuse audit before provider network call");
    assert.equal(await DeclarationLlmAssistRunModel.countDocuments({ companyId, declarationId }), 1);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId }), resolutionRunsBeforeReplay);

    const noPolicyId = new mongoose.Types.ObjectId();
    await DeclarationModel.create({ _id: noPolicyId, companyId, status: "DRAFT" });
    assert.deepEqual(await tryOrchestrateDeclarationLlmAssistAfterProcessing({ companyId, declarationId: noPolicyId }), { status: "NOT_CONFIGURED" });
    await DeclarationModel.deleteOne({ _id: noPolicyId });

    console.log(JSON.stringify({
      event: "foundation-8.5.worker-llm-assist-lifecycle-integration.passed",
      integration: {
        productionWorkerFunctionUsed: true,
        explicitLlmPolicyConsumed: true,
        insufficientEvidenceSkippedBeforeProvider: true,
        groundedConflictInvokedQwenProvider: true,
        validatedAssistPersisted: true,
        resolvedAssistAppliedThroughFoundation6: true,
        selectedPackingCandidatePromoted: true,
        exactReplayReusedAssistAndResolution: true
      },
      guardrails: {
        missingPolicySkippedWithoutNetwork: true,
        directLlmNormalizedWrite: false,
        foundation6PromotionBoundaryPreserved: true,
        workerCompletionNotRewrittenByLlm: true,
        duplicateAssistRunCreated: false,
        duplicateAuthorityResolutionRunCreated: false
      }
    }, null, 2));
  } finally {
    Object.assign(env, oldEnv);
    await mock.close();
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

main().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
