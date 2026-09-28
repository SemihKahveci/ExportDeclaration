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
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";

function runPython(script: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.invoiceParserPython, [script, output], {
      cwd: path.dirname(script), env: process.env, windowsHide: true
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`fixture generator exit=${code}: ${stderr.trim()}`)));
  });
}

async function main() {
  assert.equal(env.llmEnabled, true, "1.4.4 requires LLM_ENABLED=true.");
  assert.equal(env.llmVisionEnabled, true, "1.4.4 requires LLM_VISION_ENABLED=true.");

  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "product-e2e-1.4.4-"));
  const pdfPath = path.join(tempDir, "real-worker-fusion.pdf");
  const fixtureScript = path.join(env.invoiceParserDir, "create_foundation_613_fixture.py");
  let uploadedFileId: mongoose.Types.ObjectId | undefined;
  let processingRunId: mongoose.Types.ObjectId | undefined;

  try {
    await runPython(fixtureScript, pdfPath);
    const bytes = await fs.readFile(pdfPath);
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const uploaded = await UploadedFileModel.create({
      companyId, declarationId, type: DocumentType.INVOICE,
      fileName: "product-e2e-1.4.4-real-worker-fusion.pdf", filePath: pdfPath,
      mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
    });
    uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId,
      status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
      attempt: 0, processorVersion: "product-e2e-1.4.4-real-worker-fusion"
    });
    processingRunId = run._id as mongoose.Types.ObjectId;

    await processIdpJob(String(run._id));

    const persisted = await ProcessingRunModel.findById(run._id).lean();
    assert(persisted);
    assert.equal(persisted.status, ProcessingStatus.COMPLETED);

    const raw = persisted.candidates as any;
    const invoiceSegment = raw?.segments?.find((segment: any) => segment?.documentType === "INVOICE");
    assert(invoiceSegment, "Persisted INVOICE segment missing.");
    const audit = invoiceSegment.data?.visionCandidateAudit;
    assert(audit, "Production worker did not persist visionCandidateAudit.");
    assert.equal(audit.failedPages?.length ?? 0, 0, `Vision page failed: ${JSON.stringify(audit.failedPages)}`);
    assert((audit.checkpoints?.length ?? 0) >= 1, "No successful Vision page checkpoint.");

    const snapshot = persisted.declarationCandidates as any;
    const allCandidates = Object.values(snapshot?.fields ?? {}).flat() as any[];
    const deterministic = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "NATIVE_TEXT" || e.contentSource === "OCR" || e.contentSource === "DERIVED"));
    const vision = allCandidates.filter((candidate) =>
      candidate?.evidence?.some((e: any) => e.contentSource === "PAGE_IMAGE"));
    assert(deterministic.length > 0, "Deterministic Native/OCR candidates disappeared after fusion.");
    assert(vision.length > 0, "Real Vision inference produced no persisted PAGE_IMAGE candidates.");

    const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(docs.length, 1);
    const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
    assert(audits.length >= 1, "F6 declaration resolution audit missing.");

    const declaration = await DeclarationModel.findOne({ _id: declarationId, companyId }).lean();
    assert(declaration, "Declaration disappeared after worker lifecycle.");
    assert(declaration.idpResolution, "Declaration lifecycle did not persist the F6 resolution snapshot.");
    const promotedInvoiceDate = (declaration.normalizedData as any)?.header?.invoiceDate;
    assert(promotedInvoiceDate instanceof Date, `Lifecycle did not canonicalize invoiceDate to Date: ${JSON.stringify(promotedInvoiceDate)}`);
    assert.equal(
      promotedInvoiceDate.toISOString().slice(0, 10),
      "2026-09-23",
      "Lifecycle promoted the wrong canonical invoice date."
    );

    console.log(JSON.stringify({
      event: "product-e2e-1.4.4.real-worker-fusion-e2e.passed",
      workerCompleted: true,
      realPdfRenderedForVision: true,
      realConfiguredVisionProviderInvoked: true,
      visionPageCheckpoints: audit.checkpoints.length,
      visionFailedPages: audit.failedPages.length,
      deterministicCandidateCount: deterministic.length,
      visionCandidateCount: vision.length,
      fusedSnapshotPersisted: true,
      foundation6ResolutionAuditReached: true,
      declarationLifecyclePromoted: true,
      canonicalInvoiceDate: promotedInvoiceDate.toISOString().slice(0, 10),
      directNormalizedWrite: false
    }, null, 2));
  } finally {
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
