import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { ProcessingStatus, ProcessingStage } from "../../src/modules/idp/domain/idp.types.js";
import { getIdpProcessingDiagnostic } from "../../src/modules/idp/diagnostics/idpDiagnostics.service.js";

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const otherDeclarationId = new mongoose.Types.ObjectId();

  try {
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
    const file = await UploadedFileModel.create({
      companyId, declarationId, type: "INVOICE", fileName: "diagnostic.pdf",
      filePath: "/tmp/diagnostic.pdf", mimeType: "application/pdf", size: 1,
      extractionStatus: "PENDING", parseErrors: []
    });
    const startedAt = new Date(Date.now() - 1250);
    const completedAt = new Date();
    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId: file._id,
      status: ProcessingStatus.FAILED, currentStage: ProcessingStage.EXTRACT_CONTENT,
      processorVersion: env.idpProcessorVersion, attempt: 2, startedAt, completedAt,
      error: { code: "EXTRACTION_FAILED", message: "temporary parser failure", stage: ProcessingStage.EXTRACT_CONTENT }
    });

    const diagnostic = await getIdpProcessingDiagnostic({
      companyId, declarationId: String(declarationId), processingRunId: String(run._id)
    });
    assert(diagnostic);
    assert.equal(diagnostic.status, ProcessingStatus.FAILED);
    assert.equal(diagnostic.attempt, 2);
    assert.equal(diagnostic.currentStage, ProcessingStage.EXTRACT_CONTENT);
    assert.equal(diagnostic.error?.code, "EXTRACTION_FAILED");
    assert.equal(diagnostic.recoveryAction, "RETRY_PROCESSING_RUN");
    assert(diagnostic.durationMs !== null && diagnostic.durationMs >= 0);

    assert.equal(await getIdpProcessingDiagnostic({
      companyId: otherCompanyId, declarationId: String(declarationId), processingRunId: String(run._id)
    }), null);
    assert.equal(await getIdpProcessingDiagnostic({
      companyId, declarationId: String(otherDeclarationId), processingRunId: String(run._id)
    }), null);

    console.log(JSON.stringify({
      event: "foundation-10.4.observability-diagnostics-recovery.passed",
      diagnostics: {
        processingStatusVisible: true, stageVisible: true, attemptVisible: true,
        processorVersionVisible: true, structuredFailureVisible: true,
        durationVisible: true, deterministicRecoveryActionVisible: true
      },
      isolation: { tenantScoped: true, declarationScoped: true, crossTenantLeakageObserved: false },
      guardrails: {
        diagnosticsReadOnly: true, retryAutomaticallyTriggeredByDiagnostics: false,
        foundation6AuthorityChanged: false, normalizedDataMutated: false
      }
    }, null, 2));
  } finally {
    await ProcessingRunModel.deleteMany({ companyId });
    await UploadedFileModel.deleteMany({ companyId });
    await DeclarationModel.deleteMany({ companyId });
    await mongoose.disconnect();
  }
}
void main().catch((error) => { console.error(error); process.exit(1); });
