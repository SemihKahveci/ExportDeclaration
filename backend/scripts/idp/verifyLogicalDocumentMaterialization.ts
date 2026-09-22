import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { materializeLogicalDocuments } from "../../src/modules/idp/domain/logicalDocumentMaterializer.js";

async function main(){
 await mongoose.connect(env.mongoUri);
 const companyId=new mongoose.Types.ObjectId(),declarationId=new mongoose.Types.ObjectId(),uploadedFileId=new mongoose.Types.ObjectId(),processingRunId=new mongoose.Types.ObjectId();
 try{
  await LogicalDocumentModel.create({companyId,declarationId,uploadedFileId,type:"INVOICE",pageStart:1,classificationMethod:"UPLOAD_DECLARED",classificationEvidence:["upload-declared-type"]});
  const docs=await materializeLogicalDocuments({companyId,declarationId,uploadedFileId,processingRunId,segments:[
   {segmentId:"seg-1",startPage:1,endPage:2,pageNumbers:[1,2],boundaryReason:"DOCUMENT_START",boundarySignals:{}},
   {segmentId:"seg-2",startPage:3,endPage:3,pageNumbers:[3],boundaryReason:"DOCUMENT_TYPE_CHANGE",boundarySignals:{}}
  ],classifications:[
   {segmentId:"seg-1",documentType:"INVOICE",confidence:.97,method:"DETERMINISTIC",evidence:["field:invoice-number"]},
   {segmentId:"seg-2",documentType:"ATR",confidence:.95,method:"DETERMINISTIC",evidence:["title:atr-number"]}
  ]});
  assert.equal(docs.length,2); assert.equal(docs[0]?.type,"INVOICE"); assert.equal(docs[0]?.pageStart,1); assert.equal(docs[0]?.pageEnd,2);
  assert.equal(docs[1]?.type,"ATR"); assert.equal(docs[1]?.pageStart,3); assert.equal(docs[1]?.pageEnd,3);
  assert(docs.every(d=>d.classificationMethod==="DETERMINISTIC")); assert(docs.every(d=>String(d.sourceProcessingRunId)===String(processingRunId)));
  console.log(JSON.stringify({event:"foundation-6.1.logical-document-materialization.passed",physicalUploadedFiles:1,logicalDocuments:2,types:docs.map(d=>d.type),pageRanges:docs.map(d=>[d.pageStart,d.pageEnd]),deterministicClassificationPersisted:true,sourceProcessingRunPersisted:true},null,2));
 } finally { await LogicalDocumentModel.deleteMany({uploadedFileId}); await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
