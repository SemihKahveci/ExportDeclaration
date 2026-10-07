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

const DEFAULT_CASES = ["eryem-yem-0037"];
const LABEL = /\b(?:brüt|brut|gross|net)(?:\s+(?:kg|kgs|kilogram|kilograms|weight|ağırlık|agirlik))?\b/i;
const NUMBER = /\b\d[\d.,]*\b/g;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitTerminal(runId: string, id: string, timeout = 120 * 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const run: any = await ProcessingRunModel.findById(runId).lean();
    assert(run, `${id}: run disappeared`);
    const job = await getIdpQueue().getJob(runId);
    assert(job, `${id}: job disappeared`);
    const state = await job.getState();
    if (run.status === ProcessingStatus.FAILED || state === "failed") throw new Error(`${id}: worker failed: ${JSON.stringify(run.error)}`);
    if ((run.status === ProcessingStatus.COMPLETED || run.status === ProcessingStatus.REVIEW_REQUIRED) && state === "completed") return;
    await sleep(500);
  }
  throw new Error(`${id}: timeout`);
}

function normalizedRows(page: any) {
  const words = [...(page?.words ?? [])].filter((word: any) => String(word?.text ?? "").trim());
  const maxY = words.reduce((max: number, word: any) => Math.max(max, Number(word.bbox?.y0 ?? 0), Number(word.bbox?.y1 ?? 0)), 0);
  const normalized = maxY <= 2;
  const tolerance = normalized ? 0.025 : Math.max(2, Number(page?.height ?? 0) * 0.004);
  const rows: any[][] = [];
  words.sort((a: any, b: any) => (((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2)) || a.bbox.x0 - b.bbox.x0);
  for (const word of words) {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    let row = rows.find((candidate) => Math.abs((((candidate[0].bbox.y0 + candidate[0].bbox.y1) / 2)) - cy) <= tolerance);
    if (!row) { row = []; rows.push(row); }
    row.push(word);
  }
  return { normalized, maxY, tolerance, rows: rows.map((row) => row.sort((a: any,b: any) => a.bbox.x0-b.bbox.x0)) };
}

function inspectPage(page: any) {
  const rowInfo = normalizedRows(page);
  const lines = (page?.lines ?? []).filter((line: any) => LABEL.test(String(line?.text ?? "")));
  const rows = rowInfo.rows.filter((row) => LABEL.test(row.map((w: any) => w.text).join(" ")));
  const anchorWords = (page?.words ?? []).filter((word: any) => LABEL.test(String(word?.text ?? "")));
  const wordWindows = anchorWords.map((anchor: any) => {
    const acy = (anchor.bbox.y0 + anchor.bbox.y1) / 2;
    const sameBand = (page.words ?? []).filter((word: any) => Math.abs((((word.bbox.y0 + word.bbox.y1) / 2)) - acy) <= rowInfo.tolerance)
      .sort((a: any,b: any) => a.bbox.x0-b.bbox.x0);
    return { anchor: anchor.text, anchorBBox: anchor.bbox, words: sameBand.map((w: any) => ({ text: w.text, bbox: w.bbox, source: w.source })), text: sameBand.map((w: any) => w.text).join(" ") };
  });
  const nativeAnchors = String(page?.nativeText ?? "").split(/\r?\n/).filter((x) => LABEL.test(x)).map((x) => ({ text: x.trim(), numbers: x.match(NUMBER) ?? [] }));
  const ocrAnchors = String(page?.ocrText ?? "").split(/\r?\n/).filter((x) => LABEL.test(x)).map((x) => ({ text: x.trim(), numbers: x.match(NUMBER) ?? [] }));
  return {
    pageNumber: page?.pageNumber,
    contentKind: page?.contentKind,
    geometry: { width: page?.width, height: page?.height, ...rowInfo, rows: undefined },
    nativeAnchorLines: nativeAnchors,
    ocrAnchorLines: ocrAnchors,
    canonicalAnchorLines: lines.map((line: any) => ({ text: line.text, bbox: line.bbox, source: line.source, numbers: String(line.text).match(NUMBER) ?? [] })),
    canonicalAnchorWordWindows: wordWindows,
    reconstructedAnchorRows: rows.map((row) => ({ text: row.map((w: any) => w.text).join(" "), words: row.map((w: any) => ({ text: w.text, bbox: w.bbox, source: w.source })) }))
  };
}

async function main() {
  assert.equal(env.llmEnabled, true); assert.equal(env.llmVisionEnabled, true);
  const requested = (process.env.GENERALIZATION_CASES ?? DEFAULT_CASES.join(",")).split(",").map((x) => x.trim()).filter(Boolean);
  const selected = CASES.filter((item: any) => requested.includes(item.id));
  assert.equal(selected.length, requested.length, `Unknown GENERALIZATION_CASES=${requested.join(",")}`);
  await mongoose.connect(env.mongoUri);
  const reports: any[] = [];
  try {
    for (const tc of selected as any[]) {
      const pdfPath = path.join(ROOT, tc.pdf); const bytes = await fs.readFile(pdfPath);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), tc.sourceSha256, `${tc.id}: frozen source changed`);
      const companyId = new mongoose.Types.ObjectId(); const declarationId = new mongoose.Types.ObjectId(); let uploadedId: any; let runId = "";
      try {
        await DeclarationModel.create({ _id: declarationId, companyId, status: "DRAFT", normalizedData: {} });
        const stat = await fs.stat(pdfPath);
        const uploaded: any = await UploadedFileModel.create({ companyId, declarationId, type: DocumentType.INVOICE, fileName: tc.pdf, filePath: pdfPath, mimeType: "application/pdf", size: stat.size, extractionStatus: "PENDING", parseErrors: [] });
        uploadedId = uploaded._id; const queued: any = await enqueueDocumentProcessing({ companyId, declarationId: String(declarationId), uploadedFileId: String(uploadedId) }); runId = String(queued._id);
        await waitTerminal(runId, tc.id);
        const run: any = await ProcessingRunModel.findById(runId).lean();
        const canonical: any = run?.canonicalDocument;
        const checkpoint: any = run?.visionCandidateCheckpoint;
        const segmentPages = Object.values(checkpoint?.segments ?? {}).flatMap((segment: any) => Object.values(segment?.pages ?? {}));
        const recovery = segmentPages.map((p: any) => ({ pageNumber: p?.pageNumber, recoveryDiagnostic: p?.recoveryDiagnostic, candidateFields: Object.keys(p?.candidates?.fields ?? {}) }));
        const report = { id: tc.id, pages: (canonical?.pages ?? []).map(inspectPage), persistedVisionRecovery: recovery };
        reports.push(report);
        console.log(JSON.stringify({ event: "product-e2e-1.6.9.17.shipment-weight-evidence-source.case.measured", ...report }, null, 2));
      } finally {
        if (runId) { const job = await getIdpQueue().getJob(runId); if (job) try { await job.remove(); } catch {} }
        await DeclarationFieldResolutionRunModel.deleteMany({ declarationId }); await LogicalDocumentModel.deleteMany({ declarationId });
        if (runId) await ProcessingRunModel.deleteMany({ _id: runId }); if (uploadedId) await UploadedFileModel.deleteMany({ _id: uploadedId }); await DeclarationModel.deleteMany({ _id: declarationId });
      }
    }
    console.log(JSON.stringify({ event: "product-e2e-1.6.9.17.shipment-weight-evidence-source.measured", cases: reports.length, reports, guardrails: { measurementOnly: true, productionExtractionChanged: false, rawCanonicalEvidenceObserved: true, geometryObserved: true, persistedRecoveryObserved: true, knownAnswerSearch: false, supplierSpecificRules: false, directNormalizedWrite: false, orchestrationAgentIntroduced: false } }, null, 2));
  } finally { await closeIdpQueue(); await mongoose.disconnect(); }
}
main().catch(async (error) => { console.error(error); try { await closeIdpQueue(); } catch {} try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
