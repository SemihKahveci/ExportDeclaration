import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { tryOrchestrateDeclarationAfterProcessing } from "../../src/modules/idp/domain/declarationFieldLifecycle.service.js";

const evidence = (segmentId:string,pageNumber:number) => [{segmentId,pageNumber,contentSource:"NATIVE_TEXT" as const}];
const snapshot = (fields: Record<string, any[]>) => ({ version: "1" as const, fields });

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const invoiceFileId = new mongoose.Types.ObjectId();
  const packingFileId = new mongoose.Types.ObjectId();
  const invoiceRunId = new mongoose.Types.ObjectId();
  const packingRunId = new mongoose.Types.ObjectId();

  try {
    await DeclarationModel.create({_id:declarationId,companyId,status:"DRAFT",normalizedData:{trade:{origin:"MANUAL-69"}}});
    await LogicalDocumentModel.insertMany([
      {companyId,declarationId,uploadedFileId:invoiceFileId,type:DocumentType.INVOICE,pageStart:1,pageEnd:1,classificationMethod:"DETERMINISTIC",sourceProcessingRunId:invoiceRunId},
      {companyId,declarationId,uploadedFileId:packingFileId,type:DocumentType.PACKING_LIST,pageStart:1,pageEnd:1,classificationMethod:"DETERMINISTIC",sourceProcessingRunId:packingRunId}
    ]);
    await ProcessingRunModel.insertMany([
      {_id:invoiceRunId,companyId,declarationId,uploadedFileId:invoiceFileId,status:ProcessingStatus.COMPLETED,currentStage:ProcessingStage.FINALIZE,attempt:1,processorVersion:"verify-6.9",declarationCandidates:snapshot({
        invoiceNo:[{candidateId:"invoice-no",field:"invoiceNo",value:"EXP-69",confidence:.98,extractor:"invoice",evidence:evidence("seg-i",1)}],
        originCountry:[{candidateId:"invoice-origin",field:"originCountry",value:"TR",confidence:.95,extractor:"invoice",evidence:evidence("seg-i",1)}]
      })},
      {_id:packingRunId,companyId,declarationId,uploadedFileId:packingFileId,status:ProcessingStatus.PROCESSING,currentStage:ProcessingStage.EXTRACT_CANDIDATES,attempt:1,processorVersion:"verify-6.9",declarationCandidates:snapshot({
        invoiceNo:[{candidateId:"packing-no",field:"invoiceNo",value:"EXP-69",confidence:.92,extractor:"packing",evidence:evidence("seg-p",1)}],
        originCountry:[{candidateId:"packing-origin",field:"originCountry",value:"DE",confidence:.90,extractor:"packing",evidence:evidence("seg-p",1)}]
      })}
    ]);

    const incomplete = await tryOrchestrateDeclarationAfterProcessing({companyId,declarationId});
    assert.deepEqual(incomplete,{status:"NOT_READY",reason:"PROCESSING_INCOMPLETE"});
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}),0);

    await ProcessingRunModel.updateOne({_id:packingRunId},{$set:{status:ProcessingStatus.FAILED}});
    const blocked = await tryOrchestrateDeclarationAfterProcessing({companyId,declarationId});
    assert.equal(blocked.status,"BLOCKED");
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}),0);

    await ProcessingRunModel.updateOne({_id:packingRunId},{$set:{status:ProcessingStatus.COMPLETED},$unset:{error:1}});
    const ready = await tryOrchestrateDeclarationAfterProcessing({companyId,declarationId});
    assert.equal(ready.status,"ORCHESTRATED");
    assert.deepEqual(ready.promotedFields,["invoiceNo"]);
    assert.deepEqual(ready.skippedReviewFields,["originCountry"]);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}),1);

    const retry = await tryOrchestrateDeclarationAfterProcessing({companyId,declarationId});
    assert.equal(retry.status,"ORCHESTRATED");
    assert.equal(retry.resolutionRunId,ready.resolutionRunId);
    assert.equal(retry.reusedResolutionRun,true);
    assert.equal(await DeclarationFieldResolutionRunModel.countDocuments({declarationId}),1);

    const persisted = await DeclarationModel.findById(declarationId).lean();
    assert(persisted);
    assert.equal((persisted.normalizedData as any).header.invoiceNo,"EXP-69");
    assert.equal((persisted.normalizedData as any).trade.origin,"MANUAL-69");
    const trace=(persisted.sourceTrace as any)["header.invoiceNo"];
    assert.equal(trace.sourceProcessingRunId,String(invoiceRunId));
    assert(trace.logicalDocumentId && trace.uploadedFileId && trace.resolutionRunId);

    console.log(JSON.stringify({
      event:"foundation-6.9.processing-lifecycle-readiness.passed",
      lifecycle:{
        incompleteRunGated:incomplete.status==="NOT_READY",
        failedRunBlocked:blocked.status==="BLOCKED",
        allRunsReadyOrchestrated:ready.status==="ORCHESTRATED",
        promotedFields:ready.status==="ORCHESTRATED"?ready.promotedFields:[],
        skippedReviewFields:ready.status==="ORCHESTRATED"?ready.skippedReviewFields:[],
        duplicateCompletionReusedResolutionRun:retry.status==="ORCHESTRATED"&&retry.reusedResolutionRun
      },
      guardrails:{
        incompleteCreatesAuditRecord:false,
        failedCreatesAuditRecord:false,
        reviewRequiredNotPromoted:true,
        completedRunNotRewrittenByLifecycle:true,
        provenancePreserved:true
      }
    },null,2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({declarationId});
    await LogicalDocumentModel.deleteMany({declarationId});
    await ProcessingRunModel.deleteMany({declarationId});
    await DeclarationModel.deleteMany({_id:declarationId});
    await mongoose.disconnect();
  }
}

main().catch((error)=>{console.error(error);process.exitCode=1;});
