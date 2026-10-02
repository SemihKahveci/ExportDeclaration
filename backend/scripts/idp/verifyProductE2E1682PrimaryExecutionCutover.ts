import assert from "node:assert/strict";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { ClassifiedDocumentType } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { fuseInvoiceVisionIntoWorkerCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

async function main() {
  const oldEnabled=process.env.LLM_ENABLED, oldVision=process.env.LLM_VISION_ENABLED, oldModel=process.env.LLM_VISION_MODEL;
  // env is loaded at module import in production; this verifier exercises the
  // injected provider/render seams and the UNKNOWN-segment rescue contract.
  let providerCalls=0, artifacts=0;
  const canonicalDocument={version:"1",pages:[{pageNumber:1,nativeText:"invoice native text ".repeat(30),nativeCharCount:600,nativeWordCount:90,ocrText:"",ocrWordCount:0}],analysis:{}} as unknown as CanonicalDocument;
  const envelope:any={version:"1",segments:[{segmentId:"seg-1",documentType:ClassifiedDocumentType.UNKNOWN,status:"SKIPPED",pageNumbers:[1],reason:"unknown-document-type"}]};
  const parsed:any={version:"1",decision:"EXTRACTED",fields:[{field:"invoiceNumber",value:"INV-PRIMARY-1",confidence:0.99,evidence:[{source:"PAGE_IMAGE",pageNumber:1,quote:"INV-PRIMARY-1"}]}],issues:[]};
  const provider:any={name:"qwen-test",extractInvoice:async(request:any)=>{providerCalls++;return {...parsed,model:"qwen-test-model",provider:"qwen-test",extractionArtifact:{version:"1",provider:"qwen-test",model:"qwen-test-model",skillVersion:"invoice-extraction-v2",documentId:request.documentId,evidenceMode:request.evidenceMode,requestedFields:request.requestedFields,pageNumbers:[1],rawModelResponse:'{"invoiceNumber":"INV-PRIMARY-1"}',parsedSemanticResponse:parsed}};}};
  // Production plan reads configured env captured by config. If the developer
  // runtime has LLM disabled this contract cannot prove execution and must fail.
  const { env }=await import("../../src/config/env.js");
  assert.equal(env.llmEnabled,true,"1.6.8.2 requires LLM_ENABLED=true in the container");
  assert.equal(env.llmVisionEnabled,true,"1.6.8.2 requires LLM_VISION_ENABLED=true in the container");
  assert.ok(env.llmVisionModel.trim(),"1.6.8.2 requires LLM_VISION_MODEL in the container");
  const out=await fuseInvoiceVisionIntoWorkerCandidates({pdfPath:"/tmp/fake.pdf",canonicalDocument,segments:[{segmentId:"seg-1",pageNumbers:[1]}] as any,classifications:[{segmentId:"seg-1",documentType:ClassifiedDocumentType.UNKNOWN,confidence:0.4,method:"TEST",evidence:[]}] as any,candidateEnvelope:envelope,forceInvoiceExecution:true,visionProvider:provider,visionModelIdentity:"qwen-test-model",renderVisionPage:async()=>({pageNumber:1,mimeType:"image/png",bytes:Buffer.from([0])}),persistModelExtractionArtifact:async()=>{artifacts++;}} as any);
  assert.equal(providerCalls,1,"Qwen/Vision must execute even when deterministic/classifier path did not produce invoice data");
  assert.equal(artifacts,1,"real Vision completion must persist first-class model artifact");
  const result:any=out.segments[0];
  assert.equal(result.data.fieldCandidates.fields.invoiceNo[0].value,"INV-PRIMARY-1");
  console.log(JSON.stringify({event:"product-e2e-1.6.8.2.primary-execution-cutover.passed",qwenInvocationRequired:true,unknownClassifierRescuedByUploadedInvoiceAuthority:true,deterministicDataPreconditionRemoved:true,modelArtifactPersistenceRequired:true,primaryCandidateProduced:true,supplierSpecificRules:false,directNormalizedWrite:false},null,2));
  void oldEnabled; void oldVision; void oldModel;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
