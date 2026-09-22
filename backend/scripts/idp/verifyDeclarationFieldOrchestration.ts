import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { orchestrateDeclarationFieldResolution } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import type { SourceFieldCandidates } from "../../src/modules/idp/domain/declarationFieldCandidateProjector.js";

const evidence = (segmentId:string,pageNumber:number) => [{segmentId,pageNumber,contentSource:"NATIVE_TEXT" as const}];

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const badDeclarationId = new mongoose.Types.ObjectId();
  const invoiceFileId = new mongoose.Types.ObjectId();
  const packingFileId = new mongoose.Types.ObjectId();
  const badFileId = new mongoose.Types.ObjectId();
  const run1 = new mongoose.Types.ObjectId();
  const run2 = new mongoose.Types.ObjectId();

  const sources: SourceFieldCandidates[] = [
    {
      uploadedFileId:String(invoiceFileId), sourceProcessingRunId:String(run1), candidates:{version:"1",fields:{
        invoiceNo:[{candidateId:"no-invoice",field:"invoiceNo",value:"EXP-68",confidence:.98,extractor:"invoice",evidence:evidence("seg-invoice",1)}],
        grossWeight:[{candidateId:"gross-invoice",field:"grossWeight",value:101.5,confidence:.94,extractor:"invoice",evidence:evidence("seg-invoice",2)}],
        originCountry:[
          {candidateId:"origin-invoice",field:"originCountry",value:"TR",confidence:.91,extractor:"invoice",evidence:evidence("seg-invoice",2)},
          {candidateId:"origin-atr",field:"originCountry",value:"DE",confidence:.96,extractor:"atr",evidence:evidence("seg-atr",3)}
        ]
      }}
    },
    {
      uploadedFileId:String(packingFileId), sourceProcessingRunId:String(run2), candidates:{version:"1",fields:{
        invoiceNo:[{candidateId:"no-packing",field:"invoiceNo",value:"EXP-68",confidence:.90,extractor:"packing",evidence:evidence("seg-packing",1)}],
        grossWeight:[{candidateId:"gross-packing",field:"grossWeight",value:103,confidence:.97,extractor:"packing",evidence:evidence("seg-packing",1)}]
      }}
    }
  ];
  const rules = [{field:"grossWeight",authority:[
    {priority:10,documentTypes:[DocumentType.PACKING_LIST]},
    {priority:20,documentTypes:[DocumentType.INVOICE]}
  ]}];

  try {
    await DeclarationModel.create({
      _id:declarationId, companyId, status:"DRAFT",
      normalizedData:{trade:{origin:"MANUAL-UNCHANGED"}},
      sourceTrace:{"trade.origin":{value:"MANUAL-UNCHANGED",source:"HUMAN_REVIEW"}}
    });
    await LogicalDocumentModel.insertMany([
      {companyId,declarationId,uploadedFileId:invoiceFileId,type:DocumentType.INVOICE,pageStart:1,pageEnd:2,classificationMethod:"DETERMINISTIC",sourceProcessingRunId:run1},
      {companyId,declarationId,uploadedFileId:invoiceFileId,type:DocumentType.ATR,pageStart:3,pageEnd:3,classificationMethod:"DETERMINISTIC",sourceProcessingRunId:run1},
      {companyId,declarationId,uploadedFileId:packingFileId,type:DocumentType.PACKING_LIST,pageStart:1,pageEnd:1,classificationMethod:"DETERMINISTIC",sourceProcessingRunId:run2}
    ]);

    const first = await orchestrateDeclarationFieldResolution({companyId,declarationId,sources,rules});
    const retry = await orchestrateDeclarationFieldResolution({companyId,declarationId,sources,rules});
    assert.equal(retry.resolutionRunId, first.resolutionRunId);
    assert.equal(retry.reusedResolutionRun, true);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}), 1);

    let persisted = await DeclarationModel.findById(declarationId).lean();
    assert(persisted);
    assert.equal((persisted.normalizedData as any).header.invoiceNo,"EXP-68");
    assert.equal((persisted.normalizedData as any).packageInfo.grossKg,103);
    assert.equal((persisted.normalizedData as any).trade.origin,"MANUAL-UNCHANGED");

    const changedSources = structuredClone(sources);
    changedSources[0]!.candidates.fields.invoiceNo![0]!.value = "EXP-68B";
    changedSources[1]!.candidates.fields.invoiceNo![0]!.value = "EXP-68B";
    const second = await orchestrateDeclarationFieldResolution({companyId,declarationId,sources:changedSources,rules});
    assert.notEqual(second.resolutionRunId, first.resolutionRunId);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}), 2);
    await assert.rejects(
      () => orchestrateDeclarationFieldResolution({companyId,declarationId,sources,rules}),
      /Stale orchestration replay/
    );
    persisted = await DeclarationModel.findById(declarationId).lean();
    assert.equal((persisted!.normalizedData as any).header.invoiceNo,"EXP-68B");

    await DeclarationModel.create({_id:badDeclarationId,companyId,status:"DRAFT"});
    await LogicalDocumentModel.insertMany([
      {companyId,declarationId:badDeclarationId,uploadedFileId:badFileId,type:DocumentType.INVOICE,pageStart:1,pageEnd:2},
      {companyId,declarationId:badDeclarationId,uploadedFileId:badFileId,type:DocumentType.ATR,pageStart:2,pageEnd:3}
    ]);
    await assert.rejects(
      () => orchestrateDeclarationFieldResolution({companyId,declarationId:badDeclarationId,sources:[],rules:[]}),
      /document set integrity failed/i
    );
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId:badDeclarationId}),0);

    console.log(JSON.stringify({
      event:"foundation-6.8.production-orchestration.passed",
      orchestration:{
        logicalDocuments:first.documentSet.documents.length,
        projectedFields:Object.keys(first.candidates.fields).sort(),
        promotedFields:first.promotion.promotedFields,
        skippedReviewFields:first.promotion.skippedReviewFields,
        exactRetryReusedResolutionRun:true,
        changedInputCreatesNewResolutionRun:true,
        latestInvoiceNo:(persisted!.normalizedData as any).header.invoiceNo
      },
      guardrails:{
        invalidDocumentSetStopsPipeline:true,
        invalidPipelineCreatesAuditRecord:false,
        exactRetryIdempotent:true,
        staleReplayCannotReplaceNewerRun:true,
        reviewRequiredNotPromoted:true,
        provenancePreserved:true
      }
    },null,2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({declarationId:{$in:[declarationId,badDeclarationId]}});
    await LogicalDocumentModel.deleteMany({declarationId:{$in:[declarationId,badDeclarationId]}});
    await DeclarationModel.deleteMany({_id:{$in:[declarationId,badDeclarationId]}});
    await mongoose.disconnect();
  }
}

main().catch((error)=>{console.error(error);process.exitCode=1;});
