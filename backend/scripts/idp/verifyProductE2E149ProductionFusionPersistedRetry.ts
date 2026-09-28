import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { CandidateExtractionStatus, type CandidateExtractionEnvelope } from "../../src/modules/idp/domain/candidateExtraction.types.js";
import { ClassifiedDocumentType, type SegmentClassification } from "../../src/modules/idp/domain/segmentClassification.types.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import {
  InvoiceLlmExtractionDecision,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse,
  type InvoiceLlmPageImage
} from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { fuseInvoiceVisionIntoWorkerCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

async function main() {
  assert.equal(env.llmEnabled, true, "LLM_ENABLED=true is required for production fusion routing.");
  assert.equal(env.llmVisionEnabled, true, "LLM_VISION_ENABLED=true is required for production fusion routing.");
  await mongoose.connect(env.mongoUri);

  const companyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const uploadedFileId = new mongoose.Types.ObjectId();
  let runId: mongoose.Types.ObjectId | undefined;

  const canonicalDocument = {
    version: "1",
    pages: [1, 2].map((pageNumber) => ({
      pageNumber, width: 100, height: 100, rotation: 0,
      nativeText: "", nativeCharCount: 0, nativeWordCount: 0,
      ocrText: "", ocrWordCount: 0, words: []
    })),
    analysis: { pageCount: 2, nativeTextPageCount: 0, scannedPageCount: 2, ocrPageCount: 2, ocrWordCount: 0 }
  } as unknown as CanonicalDocument;
  const segments: DocumentSegment[] = [{
    segmentId: "segment-001", startPage: 1, endPage: 2, pageNumbers: [1, 2],
    boundaryReason: "DOCUMENT_START", boundarySignals: { anchor: "INVOICE" }
  }];
  const classifications: SegmentClassification[] = [{
    segmentId: "segment-001", documentType: ClassifiedDocumentType.INVOICE,
    confidence: 1, method: "DETERMINISTIC", evidence: ["fixture"]
  }];
  const freshEnvelope = (): CandidateExtractionEnvelope => ({
    version: "1",
    segments: [{
      segmentId: "segment-001", documentType: ClassifiedDocumentType.INVOICE,
      status: CandidateExtractionStatus.EXTRACTED, extractor: "fixture", pageNumbers: [1, 2],
      data: { fieldCandidates: { version: "1", fields: {} } }
    }]
  });

  const calls: number[] = [];
  let failPage2 = true;
  const provider: InvoiceLlmExtractionProvider = {
    name: "checkpoint-retry-fixture",
    async extractInvoice(_request: InvoiceLlmExtractionRequest, images: InvoiceLlmPageImage[]): Promise<InvoiceLlmExtractionResponse> {
      const page = images[0]!.pageNumber;
      calls.push(page);
      if (page === 2 && failPage2) throw new Error("synthetic page-2 inference failure");
      return {
        version: "1", decision: InvoiceLlmExtractionDecision.PARTIAL,
        fields: [{
          field: "goodsLines[].hsCode", value: [`GTIP-${page}`], confidence: 0.99,
          evidence: [{ pageNumber: page, source: "PAGE_IMAGE" }]
        }],
        issues: [], model: "fixture-model", provider: "checkpoint-retry-fixture"
      };
    }
  };
  const renderVisionPage = async (pageNumber: number): Promise<InvoiceLlmPageImage> => ({
    pageNumber, mimeType: "image/png", bytes: Buffer.from(`page-${pageNumber}`)
  });

  try {
    const run = await ProcessingRunModel.create({
      companyId, declarationId, uploadedFileId, status: ProcessingStatus.PROCESSING,
      currentStage: ProcessingStage.EXTRACT_CANDIDATES, attempt: 1,
      processorVersion: "product-e2e-1.4.9"
    });
    runId = run._id as mongoose.Types.ObjectId;

    const persist = async (checkpoint: unknown) => {
      await ProcessingRunModel.updateOne(
        { _id: run._id },
        { $set: { visionCandidateCheckpoint: checkpoint } }
      );
    };

    const first = await fuseInvoiceVisionIntoWorkerCandidates({
      pdfPath: "fixture.pdf", canonicalDocument, segments, classifications,
      candidateEnvelope: freshEnvelope(), visionCheckpoint: undefined,
      persistVisionCheckpoint: persist, visionProvider: provider, renderVisionPage,
      visionModelIdentity: "fixture-model-v1"
    });
    assert.deepEqual(calls, [1, 2]);
    const firstAudit = first.segments[0]!.data!.visionCandidateAudit as any;
    assert.deepEqual(firstAudit.failedPages.map((item: any) => item.pageNumber), [2]);

    const afterFirst = await ProcessingRunModel.findById(run._id).lean();
    const checkpoint: any = afterFirst?.visionCandidateCheckpoint;
    assert.equal(checkpoint?.segments?.["segment-001"]?.pages?.["1"]?.status, "COMPLETED");
    assert.equal(checkpoint?.segments?.["segment-001"]?.pages?.["2"]?.status, "FAILED");

    failPage2 = false;
    calls.length = 0;
    const second = await fuseInvoiceVisionIntoWorkerCandidates({
      pdfPath: "fixture.pdf", canonicalDocument, segments, classifications,
      candidateEnvelope: freshEnvelope(), visionCheckpoint: checkpoint,
      persistVisionCheckpoint: persist, visionProvider: provider, renderVisionPage,
      visionModelIdentity: "fixture-model-v1"
    });

    assert.deepEqual(calls, [2], "Persisted COMPLETED page 1 must not invoke Vision again.");
    const secondFields: any = second.segments[0]!.data!.fieldCandidates;
    assert.equal(secondFields.fields["goodsLines.0.hsCode"]?.[0]?.value, "GTIP-1");
    assert.equal(secondFields.fields["goodsLines.1.hsCode"]?.[0]?.value, "GTIP-2");

    const afterRetry = await ProcessingRunModel.findById(run._id).lean();
    const retryCheckpoint: any = afterRetry?.visionCandidateCheckpoint;
    assert.equal(retryCheckpoint?.segments?.["segment-001"]?.pages?.["1"]?.status, "COMPLETED");
    assert.equal(retryCheckpoint?.segments?.["segment-001"]?.pages?.["2"]?.status, "COMPLETED");

    console.log(JSON.stringify({
      event: "product-e2e-1.4.9.production-fusion-persisted-retry.passed",
      productionFusionPathUsed: true,
      processingRunCheckpointPersistedInMongo: true,
      completedPageSkippedOnRetry: true,
      failedPageRetried: true,
      persistedCandidatesRecoveredIntoFusedEnvelope: true,
      goodsLineOffsetPreservedAcrossRetry: true,
      failedCheckpointReplacedByCompletedCheckpoint: true,
      realModelInferenceRequired: false,
      directNormalizedWrite: false
    }, null, 2));
  } finally {
    if (runId) await ProcessingRunModel.deleteOne({ _id: runId });
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
