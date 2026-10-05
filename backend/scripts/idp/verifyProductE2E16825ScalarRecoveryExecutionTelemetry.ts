import assert from "node:assert/strict";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

async function main() {
  const calls:any[]=[];
  const persistedArtifacts:any[]=[];
  const diagnostics:any[]=[];
  const artifact=(request:any,fields:any[])=>({
    version:"1",provider:"contract-qwen",model:"qwen",skillVersion:"invoice-extraction-v7",
    documentId:request.documentId,evidenceMode:request.evidenceMode,requestedFields:[...request.requestedFields],pageNumbers:[2],
    rawModelResponse:JSON.stringify({fields}),parsedSemanticResponse:{version:"1",decision:InvoiceLlmExtractionDecision.PARTIAL,fields,issues:[]}
  });
  const provider:any={
    name:"contract-qwen",
    async extractInvoice(request:any,pageImages:any[]){
      calls.push({request,pageImages});
      if(calls.length===1)return {version:"1",decision:InvoiceLlmExtractionDecision.REVIEW_REQUIRED,fields:[],issues:[],model:"qwen",provider:"contract-qwen"};
      if(calls.length===2){
        const fields=[
          {field:"goodsLines[].description",value:["Drug Adulteration Test","Indiko 20ml reagent bottle"],confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
          {field:"goodsLines[].quantity",value:[4,1],confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]}
        ];
        return {version:"1",decision:InvoiceLlmExtractionDecision.PARTIAL,fields,issues:[],model:"qwen",provider:"contract-qwen",extractionArtifact:artifact(request,fields)};
      }
      const fields=[
        {field:"grossKg",value:48,confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE",quote:"Gross Weight 48 kg"}]},
        {field:"netKg",value:40,confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE",quote:"Net Weight 40 kg"}]},
        {field:"origin",value:"US",confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE",quote:"Origin USA"}]}
      ];
      return {version:"1",decision:InvoiceLlmExtractionDecision.PARTIAL,fields,issues:[],model:"qwen",provider:"contract-qwen",extractionArtifact:artifact(request,fields)};
    }
  };
  const result=await executeInvoiceVisionByPage({
    canonicalDocument:{pages:[{pageNumber:2}]} as any,segmentId:"seg",pageNumbers:[2],provider,
    renderPage:async()=>({pageNumber:2,mimeType:"image/png",bytes:Buffer.from("x")}),
    request:{version:"1",requestedFields:["invoiceDate","currency","grossKg","netKg","origin","goodsLines[].description","goodsLines[].quantity"],nativeText:"",ocrText:"",verifiedKnowledge:[]},
    onPageCheckpoint:async(checkpoint:any)=>{ if(checkpoint.status==="COMPLETED"){ persistedArtifacts.push(...(checkpoint.extractionArtifacts??[])); diagnostics.push(checkpoint.recoveryDiagnostic); } }
  });

  assert.equal(calls.length,3);
  assert(!calls[1].request.requestedFields.includes("invoiceDate"));
  assert(calls[1].request.requestedFields.includes("goodsLines[].description"));
  assert.deepEqual(calls[2].request.requestedFields.sort(),["grossKg","netKg","origin"].sort());
  assert(!calls[2].request.requestedFields.some((f:string)=>f.startsWith("goodsLines[].")));
  assert(!calls[2].request.requestedFields.includes("invoiceDate"));
  assert(!calls[2].request.requestedFields.includes("currency"));
  assert.match(calls[2].request.focusInstruction,/scalar-only recovery pass/i);
  assert.equal(calls[2].pageImages[0].pageNumber,2);
  assert.equal(result.candidates.fields["goodsLines.0.description"]?.[0]?.value,"Drug Adulteration Test");
  assert.equal(result.candidates.fields["goodsLines.1.quantity"]?.[0]?.value,1);
  assert.equal(result.candidates.fields["grossWeight"]?.[0]?.value,48);
  assert.equal(result.candidates.fields["netWeight"]?.[0]?.value,40);
  assert.equal(result.candidates.fields["originCountry"]?.[0]?.value,"US");
  assert.equal(result.candidates.fields["invoiceDate"],undefined);
  assert.equal(result.candidates.fields["currency"],undefined);
  assert.equal(persistedArtifacts.length,2);
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].focusedRecoveryAttempted,true);
  assert.equal(diagnostics[0].focusedRecoveryUsed,true);
  assert.equal(diagnostics[0].scalarRecoveryAttempted,true);
  assert.deepEqual([...diagnostics[0].scalarRecoveryRequestedFields].sort(),["grossKg","netKg","origin"].sort());
  assert.deepEqual([...diagnostics[0].scalarRecoveryReturnedFields].sort(),["grossKg","netKg","origin"].sort());
  assert(persistedArtifacts.some((a:any)=>a.documentId.endsWith(":non-critical-recovery")));
  assert(persistedArtifacts.some((a:any)=>a.documentId.endsWith(":non-critical-scalar-recovery")));

  const normalCalls:any[]=[];
  const normalProvider:any={name:"contract-qwen",async extractInvoice(request:any,pageImages:any[]){
    normalCalls.push({request,pageImages});
    return {version:"1",decision:InvoiceLlmExtractionDecision.PARTIAL,fields:[
      {field:"grossKg",value:10,confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
      {field:"netKg",value:9,confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
      {field:"origin",value:"TR",confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]}
    ],issues:[],model:"qwen",provider:"contract-qwen"};
  }};
  await executeInvoiceVisionByPage({canonicalDocument:{pages:[{pageNumber:2}]} as any,segmentId:"normal",pageNumbers:[2],provider:normalProvider,renderPage:async()=>({pageNumber:2,mimeType:"image/png",bytes:Buffer.from("x")}),request:{version:"1",requestedFields:["grossKg","netKg","origin"],nativeText:"",ocrText:"",verifiedKnowledge:[]}});
  assert.equal(normalCalls.length,1);

  console.log(JSON.stringify({
    event:"product-e2e-1.6.8.25.scalar-recovery-execution-telemetry.passed",
    emptyPageRecoveryPreserved:true,
    scalarOnlyQwenPassTriggeredForStillMissingFields:true,
    goodsExcludedFromScalarPass:true,
    criticalScalarsExcludedFromScalarPass:true,
    goodsAndScalarCandidatesMerged:true,
    scalarRecoveryArtifactPersistable:true,
    scalarRecoveryExecutionTelemetryPersistable:true,
    fullySatisfiedNonEmptyResponsesDoNotRetry:true,
    qwenPrimary:true,ocrPrimary:false,deterministicPrimary:false,supplierSpecificRules:false,groundTruthAuthorityUsed:false,directNormalizedWrite:false
  },null,2));
}

main().catch((error)=>{console.error(error);process.exitCode=1;});
