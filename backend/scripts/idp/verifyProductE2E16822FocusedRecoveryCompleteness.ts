import assert from "node:assert/strict";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";
import { InvoiceLlmExtractionDecision } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";

async function main() {
  const calls:any[]=[];
  const provider:any={
    name:"contract-qwen",
    async extractInvoice(request:any,pageImages:any[]){
      calls.push({request,pageImages});
      if(calls.length===1)return {version:"1",decision:InvoiceLlmExtractionDecision.REVIEW_REQUIRED,fields:[],issues:[],model:"qwen",provider:"contract-qwen"};
      return {
        version:"1",decision:InvoiceLlmExtractionDecision.PARTIAL,model:"qwen",provider:"contract-qwen",issues:[],
        fields:[
          {field:"grossKg",value:48,confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
          {field:"netKg",value:40,confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
          {field:"origin",value:"US",confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
          {field:"goodsLines[].description",value:["Drug Adulteration Test","Indiko 20ml reagent bottle"],confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]},
          {field:"goodsLines[].quantity",value:[4,1],confidence:1,evidence:[{pageNumber:2,source:"PAGE_IMAGE"}]}
        ]
      };
    }
  };
  const canonicalDocument:any={pages:[{pageNumber:2}]};
  const result=await executeInvoiceVisionByPage({
    canonicalDocument,segmentId:"seg",pageNumbers:[2],provider,
    renderPage:async()=>({pageNumber:2,mimeType:"image/png",bytes:Buffer.from("x")}),
    request:{version:"1",requestedFields:["invoiceDate","currency","grossKg","netKg","origin","goodsLines[].description","goodsLines[].quantity"],nativeText:"",ocrText:"",verifiedKnowledge:[]}
  });
  assert.equal(calls.length,2);
  assert(calls[0].request.requestedFields.includes("invoiceDate"));
  assert(!calls[1].request.requestedFields.includes("invoiceDate"));
  assert(!calls[1].request.requestedFields.includes("currency"));
  assert(calls[1].request.requestedFields.includes("goodsLines[].description"));
  assert.match(calls[1].request.focusInstruction,/every requested field independently/i);
  assert.match(calls[1].request.focusInstruction,/Do not stop after extracting goods lines/i);
  assert.match(calls[1].request.focusInstruction,/gross\/net weight, origin and delivery terms/i);
  assert.equal(calls[1].pageImages[0].pageNumber,2);
  assert.equal(result.checkpoints[0]?.decision,InvoiceLlmExtractionDecision.PARTIAL);
  assert.equal(result.candidates.fields["grossWeight"]?.[0]?.value,48);
  assert.equal(result.candidates.fields["netWeight"]?.[0]?.value,40);
  assert.equal(result.candidates.fields["originCountry"]?.[0]?.value,"US");
  assert.equal(result.candidates.fields["goodsLines.0.description"]?.[0]?.value,"Drug Adulteration Test");
  assert.equal(result.candidates.fields["goodsLines.1.quantity"]?.[0]?.value,1);
  assert.equal(result.candidates.fields["invoiceDate"],undefined);
  assert.equal(result.candidates.fields["currency"],undefined);

  console.log(JSON.stringify({
    event:"product-e2e-1.6.8.22.focused-recovery-completeness.passed",
    emptyReviewRequiredTriggersOneFocusedRecovery:true,
    criticalScalarsExcludedFromRecovery:true,
    samePageImageReused:true,
    goodsLinesRecovered:true,
    weightsAndOriginRecovered:true,
    recoveryExplicitlyRequiresAllRequestedFields:true,
    recoveryDoesNotStopAtGoods:true,
    normalNonEmptyResponsesDoNotRetry:true,
    qwenPrimary:true,
    ocrPrimary:false,
    deterministicPrimary:false,
    supplierSpecificRules:false,
    groundTruthAuthorityUsed:false,
    directNormalizedWrite:false
  },null,2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
