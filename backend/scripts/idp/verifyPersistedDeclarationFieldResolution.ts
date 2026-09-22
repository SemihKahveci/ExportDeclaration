import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { resolveAndPersistDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolution.service.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const evidence = (segmentId:string,pageNumber:number) => [{segmentId,pageNumber,contentSource:"NATIVE_TEXT" as const}];

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const run1 = new mongoose.Types.ObjectId();
  const run2 = new mongoose.Types.ObjectId();

  const candidates: DeclarationFieldCandidateEnvelope = {
    version:"1", companyId:String(companyId), declarationId:String(declarationId), fields:{
      invoiceNo:[
        {candidateId:"no-invoice",field:"invoiceNo",value:"EXP-42",confidence:.98,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-invoice",documentType:DocumentType.INVOICE,sourceProcessingRunId:String(run1),evidence:evidence("seg-invoice",1)},
        {candidateId:"no-packing",field:"invoiceNo",value:"EXP-42",confidence:.90,extractor:"packing",logicalDocumentId:"ld-packing",uploadedFileId:"file-packing",documentType:DocumentType.PACKING_LIST,sourceProcessingRunId:String(run2),evidence:evidence("seg-packing",1)}
      ],
      grossWeight:[
        {candidateId:"gross-invoice",field:"grossWeight",value:101.5,confidence:.94,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-invoice",documentType:DocumentType.INVOICE,sourceProcessingRunId:String(run1),evidence:evidence("seg-invoice",2)},
        {candidateId:"gross-packing",field:"grossWeight",value:103,confidence:.97,extractor:"packing",logicalDocumentId:"ld-packing",uploadedFileId:"file-packing",documentType:DocumentType.PACKING_LIST,sourceProcessingRunId:String(run2),evidence:evidence("seg-packing",1)}
      ],
      originCountry:[
        {candidateId:"origin-invoice",field:"originCountry",value:"TR",confidence:.91,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-invoice",documentType:DocumentType.INVOICE,sourceProcessingRunId:String(run1),evidence:evidence("seg-invoice",2)},
        {candidateId:"origin-atr",field:"originCountry",value:"DE",confidence:.96,extractor:"atr",logicalDocumentId:"ld-atr",uploadedFileId:"file-invoice",documentType:DocumentType.ATR,sourceProcessingRunId:String(run1),evidence:evidence("seg-atr",3)}
      ]
    }
  };

  try {
    await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT" });
    const { run, resolution } = await resolveAndPersistDeclarationFields({
      companyId, declarationId, candidates,
      rules:[{field:"grossWeight",authority:[
        {priority:10,documentTypes:[DocumentType.PACKING_LIST]},
        {priority:20,documentTypes:[DocumentType.INVOICE]}
      ]}]
    });

    const persistedDeclaration = await DeclarationModel.findOne({ _id: declarationId, companyId }).lean();
    assert(persistedDeclaration);
    assert.equal(String(persistedDeclaration.idpResolution?.resolutionRunId), String(run._id));
    assert.deepEqual(persistedDeclaration.idpResolution?.reviewRequiredFields, ["originCountry"]);

    const persistedRun = await DeclarationFieldResolutionRunModel.findById(run._id).lean();
    assert(persistedRun);
    assert.deepEqual(persistedRun.sourceProcessingRunIds, [String(run1), String(run2)].sort());
    assert.equal(persistedRun.resolution.fields.grossWeight.selectedCandidate?.logicalDocumentId, "ld-packing");
    assert.equal(persistedRun.resolution.fields.grossWeight.selectedCandidate?.evidence[0]?.segmentId, "seg-packing");
    assert.equal(persistedRun.resolution.fields.originCountry.status, "REVIEW_REQUIRED");
    assert.equal(resolution.fields.grossWeight.value, 103);

    await assert.rejects(
      () => resolveAndPersistDeclarationFields({ companyId: otherCompanyId, declarationId, candidates: { ...candidates, companyId: String(otherCompanyId) } }),
      /Declaration not found in company scope/
    );
    await assert.rejects(
      () => resolveAndPersistDeclarationFields({ companyId, declarationId, candidates: { ...candidates, declarationId: String(new mongoose.Types.ObjectId()) } }),
      /declaration scope mismatch/
    );

    const auditCount = await DeclarationFieldResolutionRunModel.countDocuments({ companyId, declarationId });
    assert.equal(auditCount, 1, "failed scoped writes must not create audit records");

    console.log(JSON.stringify({
      event:"foundation-6.6.persisted-declaration-field-resolution.passed",
      persistence:{
        resolutionRunPersisted:true,
        declarationSnapshotPersisted:true,
        reviewRequiredFields:["originCountry"],
        sourceProcessingRuns:persistedRun.sourceProcessingRunIds.length,
        selectedCandidateProvenancePreserved:true,
        evidencePreserved:true
      },
      guardrails:{
        companyIsolation:true,
        declarationEnvelopeScopeEnforced:true,
        failedScopedWriteCreatesAuditRecord:false,
        appendOnlyAuditBoundary:true
      }
    },null,2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error)=>{ console.error(error); process.exitCode=1; });
