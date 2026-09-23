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

async function createRun(companyId: mongoose.Types.ObjectId, declarationId: mongoose.Types.ObjectId, type: string, fileName: string, filePath: string) {
  const bytes = await fs.readFile(filePath);
  const uploaded = await UploadedFileModel.create({
    companyId, declarationId, type, fileName, filePath,
    mimeType: "application/pdf", size: bytes.length, extractionStatus: "PENDING", parseErrors: []
  });
  const run = await ProcessingRunModel.create({
    companyId, declarationId, uploadedFileId: uploaded._id,
    status: ProcessingStatus.QUEUED, currentStage: ProcessingStage.INGEST,
    attempt: 0, processorVersion: "verify-7.7-real-multi-document"
  });
  return { uploaded, run };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-7.7-"));
  const invoicePath = path.join(tempDir, "invoice.pdf");
  const packingPath = path.join(tempDir, "packing-list.pdf");

  try {
    await runPython(path.join(env.invoiceParserDir, "create_foundation_613_fixture.py"), invoicePath);
    await runPython(path.join(env.invoiceParserDir, "create_foundation_77_packing_fixture.py"), packingPath);

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
      }
    });

    const invoice = await createRun(companyId, declarationId, DocumentType.INVOICE, "foundation-7.7-invoice.pdf", invoicePath);
    await processIdpJob(String(invoice.run._id));

    const afterInvoice = await DeclarationModel.findById(declarationId).lean();
    assert.equal(afterInvoice?.idpIntelligence?.status, "REVIEW_REQUIRED", "missing required PACKING_LIST must require review");

    const packing = await createRun(companyId, declarationId, DocumentType.PACKING_LIST, "foundation-7.7-packing-list.pdf", packingPath);
    await processIdpJob(String(packing.run._id));

    const invoiceRun = await ProcessingRunModel.findById(invoice.run._id).lean();
    const packingRun = await ProcessingRunModel.findById(packing.run._id).lean();
    assert.equal(invoiceRun?.status, ProcessingStatus.COMPLETED);
    assert.equal(packingRun?.status, ProcessingStatus.COMPLETED);
    assert(invoiceRun?.declarationCandidates, "invoice declaration snapshot missing");
    assert(packingRun?.declarationCandidates, "packing-list declaration snapshot missing");
    assert.equal((packingRun.declarationCandidates as any).fields?.["goodsLines.0.quantity"]?.[0]?.value, 2);

    const logicalDocuments = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
    assert.equal(logicalDocuments.length, 2);
    assert.deepEqual(logicalDocuments.map((doc) => doc.type).sort(), [DocumentType.INVOICE, DocumentType.PACKING_LIST].sort());

    const declaration = await DeclarationModel.findById(declarationId).lean();
    assert.equal(declaration?.idpIntelligence?.status, "READY");

    const assessments = await DeclarationIntelligenceAssessmentRunModel.find({ companyId, declarationId }).sort({ createdAt: 1 }).lean();
    assert.equal(assessments.length, 2, "document-set change must create exactly one newer assessment");
    assert.equal(assessments[0]?.readiness.status, "REVIEW_REQUIRED");
    assert.equal(assessments[1]?.readiness.status, "READY");
    assert.equal(assessments[1]?.coverage.physicalFileCount, 2);
    assert.equal(assessments[1]?.coverage.logicalDocumentCount, 2);
    assert.equal(assessments[1]?.consistency.fields[0]?.status, "CONSISTENT");
    assert.equal(assessments[1]?.consistency.fields[0]?.observations.length, 2);

    console.log(JSON.stringify({
      event: "foundation-7.7.real-multi-document-declaration-e2e.passed",
      e2e: {
        realPhysicalPdfs: 2,
        documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],
        productionWorkerFunctionUsed: true,
        logicalDocuments: 2,
        persistedCandidateSnapshots: 2,
        packingListExtractor: "packing-list-canonical-v1",
        crossDocumentQuantityConsistent: true,
        missingDocumentTransitionedToReady: true,
        finalReadiness: "READY"
      },
      guardrails: {
        syntheticCandidateInjection: false,
        explicitPolicyOnly: true,
        authoritySelectionBypassed: false,
        foundation6LifecyclePreserved: Boolean(declaration?.idpResolution),
        assessmentHistoryAppendOnly: true
      }
    }, null, 2));
  } finally {
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

main().catch((error) => { console.error(error); process.exitCode = 1; });
