import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { buildProcessingRunCandidateSnapshot } from "../../src/modules/idp/domain/processingRunCandidateSnapshot.js";
import { tryOrchestrateDeclarationAfterProcessing } from "../../src/modules/idp/domain/declarationFieldLifecycle.service.js";

const evidence=(segmentId:string,pageNumber:number)=>[{segmentId,pageNumber,contentSource:"NATIVE_TEXT" as const}];
const snapshot=(candidateId:string,value:string)=>({version:"1" as const,fields:{invoiceNo:[{candidateId,field:"invoiceNo",value,confidence:.99,extractor:"verify",evidence:evidence(candidateId,1)}]}});

async function main(){
  await mongoose.connect(env.mongoUri);
  const companyId=new mongoose.Types.ObjectId();
  const declarationId=new mongoose.Types.ObjectId();
  const fileId=new mongoose.Types.ObjectId();
  const staleRunId=new mongoose.Types.ObjectId();
  const activeRunId=new mongoose.Types.ObjectId();
  try{
    const flattened=buildProcessingRunCandidateSnapshot({version:"1",segments:[
      {segmentId:"seg-1",documentType:"INVOICE",status:"EXTRACTED",pageNumbers:[1],data:{fieldCandidates:snapshot("from-segment","EXP-FLAT")}},
      {segmentId:"seg-2",documentType:"UNKNOWN",status:"SKIPPED",pageNumbers:[2],reason:"unknown-document-type"}
    ]});
    assert.equal(flattened.fields.invoiceNo?.[0]?.value,"EXP-FLAT");

    await DeclarationModel.create({_id:declarationId,companyId,status:"DRAFT",normalizedData:{}});
    await LogicalDocumentModel.create({companyId,declarationId,uploadedFileId:fileId,type:DocumentType.INVOICE,pageStart:1,pageEnd:1,classificationMethod:"DETERMINISTIC",sourceProcessingRunId:activeRunId});
    await ProcessingRunModel.insertMany([
      {_id:staleRunId,companyId,declarationId,uploadedFileId:fileId,status:ProcessingStatus.COMPLETED,currentStage:ProcessingStage.FINALIZE,attempt:1,processorVersion:"verify-6.10",declarationCandidates:snapshot("stale","EXP-OLD")},
      {_id:activeRunId,companyId,declarationId,uploadedFileId:fileId,status:ProcessingStatus.COMPLETED,currentStage:ProcessingStage.FINALIZE,attempt:1,processorVersion:"verify-6.10",candidates:snapshot("wrong-boundary","EXP-RAW"),declarationCandidates:snapshot("active","EXP-NEW")}
    ]);

    const ready=await tryOrchestrateDeclarationAfterProcessing({companyId,declarationId});
    assert.equal(ready.status,"ORCHESTRATED");
    const persisted=await DeclarationModel.findById(declarationId).lean();
    assert(persisted);
    assert.equal((persisted.normalizedData as any).header.invoiceNo,"EXP-NEW");
    assert.notEqual((persisted.normalizedData as any).header.invoiceNo,"EXP-OLD");
    assert.notEqual((persisted.normalizedData as any).header.invoiceNo,"EXP-RAW");
    const trace=(persisted.sourceTrace as any)["header.invoiceNo"];
    assert.equal(trace.sourceProcessingRunId,String(activeRunId));

    const firstRunCount=await DeclarationFieldResolutionRunModel.countDocuments({declarationId});
    assert.equal(firstRunCount,1);

    await ProcessingRunModel.updateOne({_id:activeRunId},{$unset:{declarationCandidates:1}});
    const missing=await tryOrchestrateDeclarationAfterProcessing({companyId,declarationId});
    assert.deepEqual(missing,{status:"NOT_READY",reason:"CANDIDATES_NOT_READY"});
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}),1);

    console.log(JSON.stringify({
      event:"foundation-6.10.processing-run-candidate-persistence.passed",
      persistence:{
        segmentCandidatesFlattened:true,
        declarationSnapshotPersistedBoundary:true,
        activeRunValue:"EXP-NEW",
        activeRunProvenancePreserved:trace.sourceProcessingRunId===String(activeRunId)
      },
      guardrails:{
        rawExtractionEnvelopeNotConsumed:true,
        staleRunCandidatesIgnored:true,
        missingSnapshotGatesOrchestration:missing.status==="NOT_READY",
        missingSnapshotCreatesAuditRecord:false,
        activeLogicalDocumentRunIsAuthoritative:true
      }
    },null,2));
  }finally{
    await DeclarationFieldResolutionRunModel.deleteMany({declarationId});
    await LogicalDocumentModel.deleteMany({declarationId});
    await ProcessingRunModel.deleteMany({declarationId});
    await DeclarationModel.deleteMany({_id:declarationId});
    await mongoose.disconnect();
  }
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
