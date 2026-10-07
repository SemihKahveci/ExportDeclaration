import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import { enqueueDocumentProcessing } from "../../src/modules/idp/queue/idpProcessing.service.js";
import { closeIdpQueue, getIdpQueue } from "../../src/modules/idp/queue/idpQueue.js";
import { PRODUCT_E2E_GENERALIZATION_CASES as CASES, PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT as ROOT } from "./productE2EGeneralizationGroundTruth.js";

const DEFAULT_CASES = ["eryem-yem-0037", "dermeternal-2026-0001"];
const NUMERIC_FIELD = /^(grossWeight|netWeight|goodsLines\.\d+\.(quantity|unitPrice|lineTotal))$/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitTerminal(runId: string, id: string, timeout = 120 * 60_000) {
  const deadline = Date.now() + timeout;
  let last = "";
  while (Date.now() < deadline) {
    const run: any = await ProcessingRunModel.findById(runId).lean();
    assert(run, `${id}: run disappeared`);
    const job = await getIdpQueue().getJob(runId);
    assert(job, `${id}: job disappeared`);
    const state = await job.getState();
    const snapshot = `${run.status}/${run.currentStage}/${state}/attempt=${run.attempt}`;
    if (snapshot !== last) {
      console.log(JSON.stringify({ event: "product-e2e-1.6.9.9.case.progress", id, state: snapshot }));
      last = snapshot;
    }
    if (run.status === ProcessingStatus.FAILED || state === "failed") throw new Error(`${id}: worker failed: ${JSON.stringify(run.error)}`);
    if ((run.status === ProcessingStatus.COMPLETED || run.status === ProcessingStatus.REVIEW_REQUIRED) && state === "completed") return;
    await sleep(500);
  }
  throw new Error(`${id}: timeout`);
}

function safeJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return { unparsed: raw }; }
}

function numericFields(fields: any): Record<string, unknown> {
  if (!fields || typeof fields !== "object") return {};
  return Object.fromEntries(Object.entries(fields).filter(([field]) => NUMERIC_FIELD.test(field)));
}

function artifactReport(artifact: any) {
  const raw: any = safeJson(artifact?.rawModelResponse ?? "");
  const parsedFields = Array.isArray(artifact?.parsedSemanticResponse?.fields)
    ? artifact.parsedSemanticResponse.fields.filter((field: any) =>
        field?.field === "grossWeight" || field?.field === "netWeight" || String(field?.field ?? "").startsWith("goodsLines[]."))
    : [];
  return {
    documentId: artifact?.documentId,
    evidenceMode: artifact?.evidenceMode,
    pageNumbers: artifact?.pageNumbers,
    rawGoodsLines: raw?.goodsLines,
    rawGrossKg: raw?.grossKg,
    rawNetKg: raw?.netKg,
    parsedNumericAndGoodsFields: parsedFields
  };
}

async function main() {
  assert.equal(env.llmEnabled, true);
  assert.equal(env.llmVisionEnabled, true);
  const requested = (process.env.GENERALIZATION_CASES ?? DEFAULT_CASES.join(",")).split(",").map((x) => x.trim()).filter(Boolean);
  const selected = CASES.filter((item: any) => requested.includes(item.id));
  assert.equal(selected.length, requested.length, `Unknown GENERALIZATION_CASES=${requested.join(",")}`);
  await mongoose.connect(env.mongoUri);
  const reports: any[] = [];
  try {
    for (let index = 0; index < selected.length; index++) {
      const tc: any = selected[index]!;
      const pdfPath = path.join(ROOT, tc.pdf);
      const bytes = await fs.readFile(pdfPath);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), tc.sourceSha256, `${tc.id}: frozen source changed`);
      const companyId = new mongoose.Types.ObjectId();
      const declarationId = new mongoose.Types.ObjectId();
      let uploadedId: any;
      let runId = "";
      console.log(JSON.stringify({ event: "product-e2e-1.6.9.9.case.started", case: index + 1, total: selected.length, id: tc.id }));
      try {
        await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
        const stat = await fs.stat(pdfPath);
        const uploaded: any = await UploadedFileModel.create({ companyId, declarationId, type: DocumentType.INVOICE, fileName: tc.pdf, filePath: pdfPath, mimeType: "application/pdf", size: stat.size, extractionStatus: "PENDING", parseErrors: [] });
        uploadedId = uploaded._id;
        const queued: any = await enqueueDocumentProcessing({ companyId, declarationId: String(declarationId), uploadedFileId: String(uploadedId) });
        runId = String(queued._id);
        await waitTerminal(runId, tc.id);

        const run: any = await ProcessingRunModel.findById(runId).lean();
        const resolutionRun: any = await DeclarationFieldResolutionRunModel.findOne({ declarationId }).sort({ createdAt: -1 }).lean();
        const declaration: any = await DeclarationModel.findById(declarationId).lean();
        const artifacts = (Array.isArray(run?.modelExtractionArtifacts) ? run.modelExtractionArtifacts : []).map(artifactReport);
        const candidateFields = numericFields(resolutionRun?.candidateEnvelope?.fields);
        const resolutionFields = numericFields(resolutionRun?.resolution?.fields);
        const report = {
          id: tc.id,
          artifacts,
          runCandidateFields: numericFields(run?.declarationCandidates?.fields ?? run?.candidates?.fields),
          foundation6CandidateFields: candidateFields,
          foundation6ResolutionFields: resolutionFields,
          finalNormalizedData: {
            grossWeight: declaration?.normalizedData?.grossWeight,
            netWeight: declaration?.normalizedData?.netWeight,
            goodsLines: declaration?.normalizedData?.goodsLines
          }
        };
        reports.push(report);
        console.log(JSON.stringify({ event: "product-e2e-1.6.9.9.case.numeric-evidence", ...report }, null, 2));
      } finally {
        if (runId) { const job = await getIdpQueue().getJob(runId); if (job) try { await job.remove(); } catch {} }
        await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
        await LogicalDocumentModel.deleteMany({ declarationId });
        if (runId) await ProcessingRunModel.deleteMany({ _id: runId });
        if (uploadedId) await UploadedFileModel.deleteMany({ _id: uploadedId });
        await DeclarationModel.deleteMany({ _id: declarationId });
      }
    }
    console.log(JSON.stringify({
      event: "product-e2e-1.6.9.9.goods-numeric-evidence.measured",
      cases: reports.length,
      reports,
      guardrails: {
        frozenGroundTruthSources: true,
        measurementOnly: true,
        productionExtractionChanged: false,
        rawModelResponseObserved: true,
        candidateEnvelopeObserved: true,
        foundation6ResolutionObserved: true,
        supplierSpecificRules: false,
        directNormalizedWrite: false,
        orchestrationAgentIntroduced: false
      }
    }, null, 2));
  } finally {
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await closeIdpQueue(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
