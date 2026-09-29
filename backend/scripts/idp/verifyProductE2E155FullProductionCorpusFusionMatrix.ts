import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStage, ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { processIdpJob } from "../../src/modules/idp/worker/processIdpJob.js";
import { PRODUCT_E2E_CORPUS_CASES, PRODUCT_E2E_CORPUS_ROOT } from "./productE2ECorpusGroundTruth.js";

const normText = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g,"I").toUpperCase().replace(/\s+/g," ").trim();
const normCode = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const num = (v: unknown) => typeof v === "number" ? v : Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
const eqNum = (a: unknown, b: number) => Number.isFinite(num(a)) && Math.abs(num(a) - b) <= Math.max(1e-6, Math.abs(b) * 1e-6);

function candidateSources(snapshot: any, field: string): string[] {
  const candidates = snapshot?.fields?.[field] ?? [];
  return [...new Set(candidates.flatMap((c: any) => (c?.evidence ?? []).map((e: any) => e?.contentSource).filter(Boolean)))].sort() as string[];
}

const CONFLICT_TARGETS: Record<string, string[]> = {
  "clk-celikel": ["invoiceNo"],
  "makro-boya": ["goodsLines.0.description", "goodsLines.0.unitPrice"]
};

function compactConflictCandidate(candidate: any) {
  return {
    value: candidate?.value,
    valueType: typeof candidate?.value,
    confidence: candidate?.confidence,
    extractor: candidate?.extractor,
    candidateId: candidate?.candidateId,
    evidence: Array.isArray(candidate?.evidence)
      ? candidate.evidence.map((e: any) => ({
          contentSource: e?.contentSource,
          pageNumber: e?.pageNumber,
          text: e?.text,
          bbox: e?.bbox
        }))
      : []
  };
}

function conflictCandidateDump(snapshot: any, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [
    field,
    (snapshot?.fields?.[field] ?? []).map(compactConflictCandidate)
  ]));
}

async function main() {
  assert.equal(env.llmEnabled, true, "1.5.5 requires LLM_ENABLED=true.");
  assert.equal(env.llmVisionEnabled, true, "1.5.5 requires LLM_VISION_ENABLED=true.");
  await mongoose.connect(env.mongoUri);

  const selected = process.env.PRODUCT_E2E_CASE
    ? PRODUCT_E2E_CORPUS_CASES.filter((c) => c.id === process.env.PRODUCT_E2E_CASE)
    : PRODUCT_E2E_CORPUS_CASES;
  assert(selected.length > 0, `Unknown PRODUCT_E2E_CASE=${process.env.PRODUCT_E2E_CASE}`);

  const results: any[] = [];
  try {
    for (let index = 0; index < selected.length; index++) {
      const corpus = selected[index]!;
      const pdfPath = path.join(PRODUCT_E2E_CORPUS_ROOT, corpus.pdf);
      const stat = await fs.stat(pdfPath);
      const companyId = new mongoose.Types.ObjectId();
      const declarationId = new mongoose.Types.ObjectId();
      let uploadedFileId: mongoose.Types.ObjectId | undefined;
      let processingRunId: mongoose.Types.ObjectId | undefined;

      console.log(JSON.stringify({ event:"product-e2e-1.5.5.case.started", case:index + 1, total:selected.length, id:corpus.id, pdf:corpus.pdf }));
      try {
        await DeclarationModel.create({ _id: declarationId, companyId, status:"DRAFT", normalizedData:{} });
        const uploaded = await UploadedFileModel.create({
          companyId, declarationId, type:DocumentType.INVOICE, fileName:corpus.pdf, filePath:pdfPath,
          mimeType:"application/pdf", size:stat.size, extractionStatus:"PENDING", parseErrors:[]
        });
        uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
        const run = await ProcessingRunModel.create({
          companyId, declarationId, uploadedFileId, status:ProcessingStatus.QUEUED,
          currentStage:ProcessingStage.INGEST, attempt:0, processorVersion:"product-e2e-1.5.5-full-production-corpus-fusion"
        });
        processingRunId = run._id as mongoose.Types.ObjectId;

        await processIdpJob(String(run._id));

        const persisted = await ProcessingRunModel.findById(run._id).lean();
        assert(persisted, "ProcessingRun disappeared.");
        const declaration = await DeclarationModel.findById(declarationId).lean();
        assert(declaration, "Declaration disappeared.");
        const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
        assert(docs.length >= 1, "Logical document missing.");
        const resolutionAudits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
        const snapshot = persisted.declarationCandidates as any;
        const allCandidates = Object.values(snapshot?.fields ?? {}).flat() as any[];
        const sourceCounts = {
          native: allCandidates.filter((c) => c?.evidence?.some((e:any) => e.contentSource === "NATIVE_TEXT")).length,
          ocr: allCandidates.filter((c) => c?.evidence?.some((e:any) => e.contentSource === "OCR")).length,
          derived: allCandidates.filter((c) => c?.evidence?.some((e:any) => e.contentSource === "DERIVED")).length,
          vision: allCandidates.filter((c) => c?.evidence?.some((e:any) => e.contentSource === "PAGE_IMAGE")).length
        };

        if (process.env.PRODUCT_E2E_CONFLICT_DIAGNOSTIC === "true") {
          const targets = CONFLICT_TARGETS[corpus.id] ?? [];
          if (targets.length > 0) {
            console.log(JSON.stringify({
              event: "product-e2e-1.5.24.1.in-run-authority-conflict-diagnostic.measured",
              id: corpus.id,
              processingRunId: String(run._id),
              targets,
              declarationCandidates: conflictCandidateDump(snapshot, targets),
              guardrails: {
                measurementOnly: true,
                noAdditionalModelInference: true,
                noAdditionalDatabaseMutation: true,
                capturedBeforeHarnessCleanup: true,
                customerPdfsCommitted: false,
                directNormalizedWrite: false
              }
            }, null, 2));
          }
        }

        const nd:any = declaration.normalizedData ?? {};
        const goods = Array.isArray(nd.goodsLines) ? nd.goodsLines : [];
        const first = goods[0] ?? {};
        const checks = [
          { field:"invoiceNumber", expected:corpus.expected.invoiceNumber, actual:nd?.header?.invoiceNo, passed:normText(nd?.header?.invoiceNo) === normText(corpus.expected.invoiceNumber), candidateSources:candidateSources(snapshot,"invoiceNo") },
          { field:"currency", expected:corpus.expected.currency, actual:nd?.header?.currency, passed:normText(nd?.header?.currency) === normText(corpus.expected.currency), candidateSources:candidateSources(snapshot,"currency") },
          ...(corpus.expected.deliveryTerm ? [{ field:"deliveryTerm", expected:corpus.expected.deliveryTerm, actual:nd?.trade?.deliveryTerm, passed:normText(nd?.trade?.deliveryTerm) === normText(corpus.expected.deliveryTerm), candidateSources:candidateSources(snapshot,"deliveryTerm") }] : []),
          { field:"description[0]", expected:`contains ${corpus.expected.firstGoodsLine.descriptionContains}`, actual:first.description, passed:normText(first.description).includes(normText(corpus.expected.firstGoodsLine.descriptionContains)), candidateSources:candidateSources(snapshot,"goodsLines.0.description") },
          { field:"hsCode[0]", expected:corpus.expected.firstGoodsLine.hsCode, actual:first.hsCode, passed:normCode(first.hsCode) === corpus.expected.firstGoodsLine.hsCode, candidateSources:candidateSources(snapshot,"goodsLines.0.hsCode") },
          { field:"quantity[0]", expected:String(corpus.expected.firstGoodsLine.quantity), actual:first.quantity, passed:eqNum(first.quantity, corpus.expected.firstGoodsLine.quantity), candidateSources:candidateSources(snapshot,"goodsLines.0.quantity") },
          { field:"unit[0]", expected:corpus.expected.firstGoodsLine.unit, actual:first.unit, passed:normText(first.unit) === normText(corpus.expected.firstGoodsLine.unit), candidateSources:candidateSources(snapshot,"goodsLines.0.unit") },
          { field:"unitPrice[0]", expected:String(corpus.expected.firstGoodsLine.unitPrice), actual:first.unitPrice, passed:eqNum(first.unitPrice, corpus.expected.firstGoodsLine.unitPrice), candidateSources:candidateSources(snapshot,"goodsLines.0.unitPrice") },
          { field:"lineTotal[0]", expected:String(corpus.expected.firstGoodsLine.lineTotal), actual:first.lineTotal, passed:eqNum(first.lineTotal, corpus.expected.firstGoodsLine.lineTotal), candidateSources:candidateSources(snapshot,"goodsLines.0.lineTotal") }
        ];
        const passed = checks.filter((c) => c.passed).length;
        const trace:any = declaration.sourceTrace ?? {};
        const result = {
          id:corpus.id,
          workerOutcome:persisted.status,
          autoPromoted:persisted.status === ProcessingStatus.COMPLETED,
          resolutionAuditCount:resolutionAudits.length,
          sourceCounts,
          passed, total:checks.length, percent:Number((100 * passed / checks.length).toFixed(1)),
          promotedFieldCount:Object.keys(trace).length,
          checks
        };
        results.push(result);
        console.log(JSON.stringify({ event:"product-e2e-1.5.5.case.completed", ...result }, null, 2));
      } finally {
        await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
        await LogicalDocumentModel.deleteMany({ declarationId });
        if (processingRunId) await ProcessingRunModel.deleteMany({ _id:processingRunId });
        if (uploadedFileId) await UploadedFileModel.deleteMany({ _id:uploadedFileId });
        await DeclarationModel.deleteMany({ _id:declarationId });
      }
    }

    const passed = results.reduce((sum, r) => sum + r.passed, 0);
    const total = results.reduce((sum, r) => sum + r.total, 0);
    console.log(JSON.stringify({
      event:"product-e2e-1.5.5.full-production-corpus-fusion-matrix.measured",
      cases:results.length,
      completed:results.filter((r) => r.workerOutcome === ProcessingStatus.COMPLETED).length,
      reviewRequired:results.filter((r) => r.workerOutcome === ProcessingStatus.REVIEW_REQUIRED).length,
      passed,total,percent:Number((100 * passed / total).toFixed(1)),results,
      guardrails:{ fixedGroundTruth:true, measurementOnly:true, realProductionWorker:true, realConfiguredVisionProvider:true, foundation6AuthorityPreserved:true, customerPdfsCommitted:false, directNormalizedWrite:false }
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
