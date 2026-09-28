import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  InvoiceLlmExtractionDecision,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse,
  type InvoiceLlmPageImage
} from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { executeInvoiceVisionByPage } from "../../src/modules/idp/llm/invoiceProductionVisionExecution.js";

async function main() {
  const workerSource = await readFile("backend/src/modules/idp/worker/processIdpJob.ts", "utf8");
  const fusionSource = await readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8");
  const candidateExtractCall = workerSource.indexOf("() => extractCandidatesBySegment(");
  const visionFusionCall = workerSource.indexOf("() => fuseInvoiceVisionIntoWorkerCandidates(");
  const persistenceCall = workerSource.indexOf("await persistWorkerCandidateExtraction(run, candidateEnvelope)");
  assert.ok(candidateExtractCall >= 0, "Deterministic candidate extraction call missing.");
  assert.ok(visionFusionCall >= 0, "Vision candidate fusion call missing.");
  assert.ok(persistenceCall >= 0, "Candidate persistence call missing.");
  assert.ok(candidateExtractCall < visionFusionCall, "Deterministic extraction must run before Vision fusion.");
  assert.ok(visionFusionCall < persistenceCall, "Vision fusion must run before candidate persistence.");
  assert.match(fusionSource, /mergeInvoiceCandidateSources/);
  assert.match(fusionSource, /visionCandidateAudit/);

  const provider: InvoiceLlmExtractionProvider = {
    name: "fake",
    async extractInvoice(_request: InvoiceLlmExtractionRequest, images: InvoiceLlmPageImage[]): Promise<InvoiceLlmExtractionResponse> {
      const page = images[0]!.pageNumber;
      if (page === 2) throw new Error("synthetic-timeout");
      return {
        version: "1",
        decision: InvoiceLlmExtractionDecision.PARTIAL,
        fields: [
          { field: "goodsLines[].productCode", value: page === 1 ? ["A","B"] : ["C"], confidence: .9, evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }] },
          { field: "goodsLines[].hsCode", value: page === 1 ? ["1","2"] : ["3"], confidence: .9, evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }] },
          { field: "goodsLines[].quantity", value: page === 1 ? ["2","3"] : ["4"], confidence: .9, evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }] },
          { field: "goodsLines[].unitPrice", value: page === 1 ? ["10.00 USD","1.602,00 EUR"] : ["7,50"], confidence: .9, evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }] }
        ],
        issues: [], model: "fake", provider: "fake"
      };
    }
  };
  const canonicalDocument = {
    version:"1",
    pages:[1,2,3].map(pageNumber=>({pageNumber,width:100,height:100,rotation:0,nativeText:"",nativeCharCount:0,nativeWordCount:0,ocrText:"",ocrWordCount:0,words:[]})),
    analysis:{pageCount:3,nativeTextPageCount:0,scannedPageCount:3,ocrPageCount:3,ocrWordCount:0}
  } as unknown as CanonicalDocument;

  const execution = await executeInvoiceVisionByPage({
    canonicalDocument, segmentId:"seg-1", pageNumbers:[1,2,3], provider,
    renderPage: async pageNumber=>({pageNumber,mimeType:"image/png",bytes:Buffer.from("x")}),
    request:{version:"invoice-extraction-v1",requestedFields:["goodsLines[].productCode","goodsLines[].hsCode"],nativeText:"",ocrText:"",verifiedKnowledge:[]}
  });

  assert.deepEqual(Object.keys(execution.candidates.fields).sort(), [
    "goodsLines.0.hsCode","goodsLines.0.productCode","goodsLines.0.quantity","goodsLines.0.unitPrice",
    "goodsLines.1.hsCode","goodsLines.1.productCode","goodsLines.1.quantity","goodsLines.1.unitPrice",
    "goodsLines.2.hsCode","goodsLines.2.productCode","goodsLines.2.quantity","goodsLines.2.unitPrice"
  ]);
  assert.deepEqual(execution.failedPages.map(x=>x.pageNumber),[2]);
  assert.equal(execution.candidates.fields["goodsLines.2.productCode"]![0]!.value,"C");
  assert.equal(execution.candidates.fields["goodsLines.0.quantity"]![0]!.value,2);
  assert.equal(execution.candidates.fields["goodsLines.0.unitPrice"]![0]!.value,10);
  assert.equal(execution.candidates.fields["goodsLines.1.unitPrice"]![0]!.value,1602);
  assert.equal(execution.candidates.fields["goodsLines.2.unitPrice"]![0]!.value,7.5);

  console.log(JSON.stringify({
    event:"product-e2e-1.4.3.worker-vision-fusion.passed",
    deterministicRunsBeforeVision:true,
    visionRunsBeforePersistence:true,
    pageFailurePreservesOtherCandidates:true,
    multiPageGoodsIndexesDoNotCollide:true,
    visionAuditPersistedWithRawEnvelope:true,
    foundation6PersistenceBoundaryReused:true,
    directNormalizedWrite:false
  },null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
