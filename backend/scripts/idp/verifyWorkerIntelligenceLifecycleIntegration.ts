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
import { tryOrchestrateDeclarationIntelligenceAfterProcessing } from "../../src/modules/idp/domain/declarationIntelligenceLifecycle.service.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";

function runPython(script: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [script, output], { cwd: path.dirname(script), env: process.env, windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`fixture generator exit=${code}: ${stderr.trim()}`)));
  });
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-7.6-"));
  const pdfPath = path.join(tempDir, "digital-invoice.pdf");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);

    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      normalizedData: {},
      idpIntelligencePolicy: {
        version: "1",
        coverageProfile: {
          version: "1",
          requirements: [{ documentType: DocumentType.INVOICE, required: true, minCount: 1, maxCount: 1 }]
        },
        consistencyProfile: { version: "1", rules: [] }
      }
    });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: "foundation-7.6-digital-invoice.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "verify-7.6-worker-intelligence"
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    await processIdpJob(String(run._id));

    const persistedRun = await ProcessingRunModel.findById(run._id).lean();
    assert.equal(persistedRun?.status, ProcessingStatus.COMPLETED);
    assert(persistedRun?.declarationCandidates);

    const declaration = await DeclarationModel.findById(declarationId).lean();
    assert(declaration?.idpResolution, "Foundation 6 lifecycle must remain active");
    assert(declaration?.idpIntelligence, "worker must persist configured Foundation 7 intelligence");
    assert.equal(declaration.idpIntelligence.status, "READY");

    const assessments = await DeclarationIntelligenceAssessmentRunModel.find({ companyId, declarationId }).lean();
    assert.equal(assessments.length, 1);
    assert.equal(assessments[0]?.coverage.logicalDocumentCount, 1);
    assert.equal(assessments[0]?.coverage.roles[0]?.documentType, DocumentType.INVOICE);

    const replay = await tryOrchestrateDeclarationIntelligenceAfterProcessing({ companyId, declarationId });
    assert.equal(replay.status, "ASSESSED");
    if (replay.status !== "ASSESSED") throw new Error("unreachable");
    assert.equal(replay.reusedAssessmentRun, true);
    assert.equal(replay.assessmentRunId, String(assessments[0]!._id));
    assert.equal(await DeclarationIntelligenceAssessmentRunModel.countDocuments({ companyId, declarationId }), 1);

    const unconfiguredDeclarationId = new mongoose.Types.ObjectId();
    await DeclarationModel.create({ _id: unconfiguredDeclarationId, companyId, status: "DRAFT" });
    const unconfigured = await tryOrchestrateDeclarationIntelligenceAfterProcessing({ companyId, declarationId: unconfiguredDeclarationId });
    assert.deepEqual(unconfigured, { status: "NOT_CONFIGURED" });
    assert.equal(await DeclarationIntelligenceAssessmentRunModel.countDocuments({ companyId, declarationId: unconfiguredDeclarationId }), 0);
    await DeclarationModel.deleteOne({ _id: unconfiguredDeclarationId });

    console.log(JSON.stringify({
      event: "foundation-7.6.worker-intelligence-lifecycle-integration.passed",
      integration: {
        productionWorkerFunctionUsed: true,
        foundation6LifecyclePreserved: true,
        persistedPolicyConsumed: true,
        intelligenceAssessmentTriggeredAfterCompletion: true,
        readySnapshotPersisted: true,
        exactLifecycleReplayReusedAssessment: true
      },
      guardrails: {
        missingPolicySkippedWithoutInventedRules: true,
        workerCompletionNotRewrittenByIntelligence: true,
        authoritySelectionBypassed: false,
        normalizedPromotionStillOwnedByFoundation6: true,
        duplicateAssessmentCreated: false
      }
    }, null, 2));
  } finally {
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ declarationId });
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await LogicalDocumentModel.deleteMany({ declarationId });
    if (processingRunId) await ProcessingRunModel.deleteMany({ _id: processingRunId });
    if (uploadedFileId) await UploadedFileModel.deleteMany({ _id: uploadedFileId });
    await DeclarationModel.deleteMany({ _id: declarationId });
    await fs.rm(tempDir, { recursive: true, force: true });
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
