import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { loadDeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.service.js";
import { buildDeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.js";
import { validateDeclarationDocumentSetIntegrity } from "../../src/modules/idp/domain/declarationDocumentSetIntegrity.js";

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const otherDeclarationId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const invoiceUploadId = new mongoose.Types.ObjectId();
  const packingUploadId = new mongoose.Types.ObjectId();
  const processingRunId = new mongoose.Types.ObjectId();

  try {
    await LogicalDocumentModel.insertMany([
      { companyId, declarationId, uploadedFileId: invoiceUploadId, type: DocumentType.INVOICE, pageStart: 1, pageEnd: 2, classificationConfidence: .98, classificationMethod: "DETERMINISTIC", sourceProcessingRunId: processingRunId },
      { companyId, declarationId, uploadedFileId: invoiceUploadId, type: DocumentType.ATR, pageStart: 3, pageEnd: 3, classificationConfidence: .96, classificationMethod: "DETERMINISTIC", sourceProcessingRunId: processingRunId },
      { companyId, declarationId, uploadedFileId: packingUploadId, type: DocumentType.PACKING_LIST, pageStart: 1, pageEnd: 1, classificationConfidence: .95, classificationMethod: "DETERMINISTIC", sourceProcessingRunId: processingRunId },
      { companyId, declarationId: otherDeclarationId, uploadedFileId: new mongoose.Types.ObjectId(), type: DocumentType.CMR, pageStart: 1, pageEnd: 1, classificationMethod: "DETERMINISTIC", sourceProcessingRunId: processingRunId },
      { companyId: otherCompanyId, declarationId, uploadedFileId: new mongoose.Types.ObjectId(), type: DocumentType.EUR1, pageStart: 1, pageEnd: 1, classificationMethod: "DETERMINISTIC", sourceProcessingRunId: processingRunId }
    ]);

    const loaded = await loadDeclarationDocumentSet({ companyId, declarationId });
    assert.equal(loaded.documentSet.documents.length, 3);
    assert.equal(loaded.documentSet.roles.INVOICE?.length, 1);
    assert.equal(loaded.documentSet.roles.ATR?.length, 1);
    assert.equal(loaded.documentSet.roles.PACKING_LIST?.length, 1);
    assert.equal(loaded.documentSet.roles.CMR, undefined, "foreign declaration leaked into document set");
    assert.equal(loaded.documentSet.roles.EUR1, undefined, "foreign company leaked into document set");
    assert.equal(loaded.integrity.valid, true);
    assert.deepEqual(loaded.integrity.issues, []);
    assert(loaded.documentSet.documents.every((document) => document.sourceProcessingRunId === String(processingRunId)));

    const overlappingSet = buildDeclarationDocumentSet({
      companyId: String(companyId),
      declarationId: String(declarationId),
      logicalDocuments: [
        { _id: new mongoose.Types.ObjectId(), uploadedFileId: invoiceUploadId, type: DocumentType.INVOICE, pageStart: 1, pageEnd: 2 },
        { _id: new mongoose.Types.ObjectId(), uploadedFileId: invoiceUploadId, type: DocumentType.ATR, pageStart: 2, pageEnd: 3 }
      ]
    });
    const overlapIntegrity = validateDeclarationDocumentSetIntegrity(overlappingSet);
    assert.equal(overlapIntegrity.valid, false);
    assert.equal(overlapIntegrity.issues.length, 1);
    assert.equal(overlapIntegrity.issues[0]?.code, "OVERLAPPING_LOGICAL_DOCUMENTS");

    console.log(JSON.stringify({
      event: "foundation-6.3.persisted-declaration-document-set.passed",
      persistedDocumentSet: {
        physicalUploadedFiles: new Set(loaded.documentSet.documents.map((document) => document.uploadedFileId)).size,
        logicalDocuments: loaded.documentSet.documents.length,
        roles: Object.keys(loaded.documentSet.roles).sort(),
        integrity: "VALID",
        declarationIsolation: true,
        companyIsolation: true,
        sourceProcessingRunPreserved: true
      },
      guardrails: {
        overlapDetection: overlapIntegrity.issues[0]?.code,
        silentOverlapAcceptance: false
      }
    }, null, 2));
  } finally {
    await LogicalDocumentModel.deleteMany({
      $or: [
        { companyId, declarationId: { $in: [declarationId, otherDeclarationId] } },
        { companyId: otherCompanyId, declarationId }
      ]
    });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
