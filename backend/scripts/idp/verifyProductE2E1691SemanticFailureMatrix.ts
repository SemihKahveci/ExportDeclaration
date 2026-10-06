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
import {
  PRODUCT_E2E_GENERALIZATION_CASES as CASES,
  PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT as ROOT,
  type GeneralizationExpectedGoodsLine,
} from "./productE2EGeneralizationGroundTruth.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normText = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g, "I").toUpperCase().replace(/\s+/g, " ").trim();
const normCode = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const num = (value: unknown) => typeof value === "number" ? value : Number(String(value ?? "").replace(/\s/g, "").replace(/,/g, "."));
const eqNum = (actual: unknown, expected: number) => Number.isFinite(num(actual)) && Math.abs(num(actual) - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-6);

type CheckStatus = "EXACT" | "SEMANTIC_EQUIVALENT" | "MISSING" | "MISMATCH";
const INCOTERMS = new Set(["EXW","FCA","CPT","CIP","DAP","DPU","DDP","FAS","FOB","CFR","CIF"]);
const COUNTRY_ALIASES: Record<string,string> = {
  TR:"TR", TURKIYE:"TR", TURKEY:"TR",
  US:"US", USA:"US", ABD:"US", UNITEDSTATES:"US", UNITEDSTATESOFAMERICA:"US",
  IN:"IN", INDIA:"IN", HINDISTAN:"IN",
  IT:"IT", ITALY:"IT", ITALIA:"IT",
};

function canonCountry(value: unknown): string {
  const key = normText(value).replace(/[^A-Z]/g, "");
  return COUNTRY_ALIASES[key] ?? key;
}

function canonIncoterm(value: unknown): string {
  const tokens = normText(value).match(/[A-Z]{3}/g) ?? [];
  return tokens.find((token) => INCOTERMS.has(token)) ?? normText(value);
}

function checkStatus(field: string, actual: unknown, expected: unknown): CheckStatus {
  if (actual === undefined || actual === null || normText(actual) === "") return "MISSING";
  if (field === "invoiceDate") return isoDate(actual) === String(expected) ? (String(actual) === String(expected) ? "EXACT" : "SEMANTIC_EQUIVALENT") : "MISMATCH";
  if (field === "grossWeight" || field === "netWeight") return eqNum(actual, Number(expected)) ? (Number(actual) === Number(expected) ? "EXACT" : "SEMANTIC_EQUIVALENT") : "MISMATCH";
  if (normText(actual) === normText(expected)) return "EXACT";
  if (field === "originCountry" && canonCountry(actual) === canonCountry(expected)) return "SEMANTIC_EQUIVALENT";
  if (field === "deliveryTerm" && canonIncoterm(actual) === canonIncoterm(expected)) return "SEMANTIC_EQUIVALENT";
  return "MISMATCH";
}

function isoDate(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function readField(nd: any, field: string): unknown {
  if (field === "invoiceNumber") return nd?.header?.invoiceNo;
  if (field === "currency") return nd?.header?.currency;
  if (field === "deliveryTerm") return nd?.trade?.deliveryTerm;
  if (field === "invoiceDate") return nd?.header?.invoiceDate;
  if (field === "grossWeight") return nd?.packageInfo?.grossKg;
  if (field === "netWeight") return nd?.packageInfo?.netKg;
  if (field === "originCountry") return nd?.trade?.origin;
  return undefined;
}

function scalarCheck(field: string, actual: unknown, expected: unknown) {
  const status = checkStatus(field, actual, expected);
  return { field, expected, actual, status, passed: status === "EXACT" || status === "SEMANTIC_EQUIVALENT" };
}

function goodsFieldChecks(expected: GeneralizationExpectedGoodsLine, actual: any, expectedIndex: number, actualIndex: number) {
  const checks: Array<{ field: string; expected: unknown; actual: unknown; passed: boolean }> = [];
  checks.push({
    field: `goodsLines[${expectedIndex}].description`, expected: `contains ${expected.descriptionContains}`, actual: actual?.description,
    passed: normText(actual?.description).includes(normText(expected.descriptionContains)),
  });
  if (expected.hsCode !== undefined) checks.push({ field:`goodsLines[${expectedIndex}].hsCode`, expected:expected.hsCode, actual:actual?.hsCode, passed:normCode(actual?.hsCode) === normCode(expected.hsCode) });
  if (expected.quantity !== undefined) checks.push({ field:`goodsLines[${expectedIndex}].quantity`, expected:expected.quantity, actual:actual?.quantity, passed:eqNum(actual?.quantity, expected.quantity) });
  if (expected.unit !== undefined) checks.push({ field:`goodsLines[${expectedIndex}].unit`, expected:expected.unit, actual:actual?.unit, passed:normText(actual?.unit) === normText(expected.unit) });
  if (expected.unitPrice !== undefined) checks.push({ field:`goodsLines[${expectedIndex}].unitPrice`, expected:expected.unitPrice, actual:actual?.unitPrice, passed:eqNum(actual?.unitPrice, expected.unitPrice) });
  if (expected.lineTotal !== undefined) checks.push({ field:`goodsLines[${expectedIndex}].lineTotal`, expected:expected.lineTotal, actual:actual?.lineTotal, passed:eqNum(actual?.lineTotal, expected.lineTotal) });
  return { expectedIndex, actualIndex, checks };
}

function matchGoodsLines(expectedLines: GeneralizationExpectedGoodsLine[], actualLines: any[]) {
  const remaining = new Set(actualLines.map((_, index) => index));
  return expectedLines.map((expected, expectedIndex) => {
    let bestIndex = -1;
    let bestScore = -1;
    for (const actualIndex of remaining) {
      const checks = goodsFieldChecks(expected, actualLines[actualIndex], expectedIndex, actualIndex).checks;
      const score = checks.filter((check) => check.passed).length / Math.max(1, checks.length);
      if (score > bestScore) { bestScore = score; bestIndex = actualIndex; }
    }
    if (bestIndex >= 0) remaining.delete(bestIndex);
    return goodsFieldChecks(expected, bestIndex >= 0 ? actualLines[bestIndex] : undefined, expectedIndex, bestIndex);
  });
}

function reviewCheck(nd: any, field: string) {
  if (field === "goodsLines.hsCode") {
    const values = (Array.isArray(nd?.goodsLines) ? nd.goodsLines : []).map((line: any) => line?.hsCode).filter((value: unknown) => normText(value));
    return { field, passed: values.length === 0, promotedValues: values };
  }
  const value = readField(nd, field);
  return { field, passed: value === undefined || value === null || normText(value) === "", promotedValue: value };
}

async function waitForTerminal(runId: string, caseId: string, timeoutMs = 120 * 60_000) {
  const queue = getIdpQueue();
  const deadline = Date.now() + timeoutMs;
  let lastLogAt = 0;
  let previous = "";
  while (Date.now() < deadline) {
    const run = await ProcessingRunModel.findById(runId).lean();
    assert(run, `${caseId}: ProcessingRun disappeared`);
    const job = await queue.getJob(runId);
    assert(job, `${caseId}: BullMQ job disappeared`);
    const state = await job.getState();
    const snapshot = `${run.status}/${run.currentStage}/${state}/attempt=${run.attempt}`;
    if (snapshot !== previous || Date.now() - lastLogAt >= 60_000) {
      console.log(JSON.stringify({ event:"product-e2e-1.6.9.1.case.progress", id:caseId, state:snapshot }));
      previous = snapshot;
      lastLogAt = Date.now();
    }
    if (run.status === ProcessingStatus.FAILED || state === "failed") {
      throw new Error(`${caseId}: production worker failed; status=${run.status} bullMq=${state} error=${JSON.stringify(run.error)}`);
    }
    if ((run.status === ProcessingStatus.COMPLETED || run.status === ProcessingStatus.REVIEW_REQUIRED) && state === "completed") {
      return { run, job, state };
    }
    await sleep(500);
  }
  throw new Error(`${caseId}: timed out after ${Math.round(timeoutMs / 60_000)} minutes`);
}

function classifyFailure(extractionChecks: any[], reviewChecks: any[]) {
  const failed = extractionChecks.filter((check) => !check.passed);
  const failedReview = reviewChecks.filter((check) => !check.passed);
  const classes = new Set<string>();
  for (const check of failed) {
    const field = String(check.field ?? "");
    if (field.includes(".description")) classes.add("GOODS_DESCRIPTION");
    else if (/\.(quantity|unitPrice|lineTotal)$/.test(field)) classes.add("GOODS_NUMERIC");
    else if (field.includes(".hsCode")) classes.add("GOODS_CODE");
    else if (field.includes(".unit")) classes.add("GOODS_UNIT");
    else if (field.startsWith("goodsLines")) classes.add("GOODS_OTHER");
    else if (field === "invoiceNumber") classes.add("SCALAR_IDENTITY");
    else if (field === "invoiceDate") classes.add("SCALAR_DATE");
    else if (field === "currency") classes.add("SCALAR_CURRENCY");
    else if (field === "deliveryTerm") classes.add("SCALAR_INCOTERM");
    else if (field === "originCountry") classes.add("SCALAR_ORIGIN");
    else if (field === "grossWeight" || field === "netWeight") classes.add("SCALAR_WEIGHT");
    else classes.add("OTHER");
  }
  if (failedReview.length) classes.add("FAIL_CLOSED_AUTHORITY");
  return {
    pass: failed.length === 0 && failedReview.length === 0,
    classes: [...classes],
    failedFields: failed.map((check) => check.field),
    failedReviewFields: failedReview.map((check) => check.field),
  };
}

async function main(): Promise<void> {
  assert.equal(env.llmEnabled, true, "1.6.9.1 requires LLM_ENABLED=true");
  assert.equal(env.llmVisionEnabled, true, "1.6.9.1 requires LLM_VISION_ENABLED=true");
  assert(CASES.length > 0, "1.6.9.1 requires the frozen holdout corpus");

  const requested = (process.env.GENERALIZATION_CASES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  // Mekar is the solved development/control case. The default gate deliberately
  // excludes it so the score measures invoices that were not tuned in 1.6.8.x.
  const unseenCases = CASES.filter((testCase) => testCase.id !== "mekar-ear-0068");
  const selected = requested.length ? CASES.filter((testCase) => requested.includes(testCase.id)) : unseenCases;
  assert.equal(selected.length, requested.length || unseenCases.length, `Unknown GENERALIZATION_CASES=${requested.join(",")}`);
  assert(selected.length > 0, "1.6.9.1 requires at least one selected unseen case");

  await mongoose.connect(env.mongoUri);
  const results: any[] = [];
  try {
    for (let index = 0; index < selected.length; index++) {
      const testCase = selected[index]!;
      const pdfPath = path.join(ROOT, testCase.pdf);
      const bytes = await fs.readFile(pdfPath);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), testCase.sourceSha256, `${testCase.id}: source bytes changed after ground-truth freeze`);
      const stat = await fs.stat(pdfPath);
      const companyId = new mongoose.Types.ObjectId();
      const declarationId = new mongoose.Types.ObjectId();
      let uploadedFileId: mongoose.Types.ObjectId | undefined;
      let processingRunId: mongoose.Types.ObjectId | undefined;

      console.log(JSON.stringify({ event:"product-e2e-1.6.9.1.case.started", case:index + 1, total:selected.length, id:testCase.id, mode:testCase.mode, pdf:testCase.pdf }));
      try {
        await DeclarationModel.create({ _id:declarationId, companyId, status:"DRAFT", normalizedData:{} });
        const uploaded = await UploadedFileModel.create({
          companyId, declarationId, type:DocumentType.INVOICE, fileName:testCase.pdf, filePath:pdfPath,
          mimeType:"application/pdf", size:stat.size, extractionStatus:"PENDING", parseErrors:[],
        });
        uploadedFileId = uploaded._id as mongoose.Types.ObjectId;
        const queued: any = await enqueueDocumentProcessing({ companyId, declarationId:String(declarationId), uploadedFileId:String(uploadedFileId) });
        processingRunId = queued._id as mongoose.Types.ObjectId;
        const runId = String(processingRunId);
        const queue = getIdpQueue();
        const initialJob = await queue.getJob(runId);
        assert(initialJob, `${testCase.id}: enqueue did not persist BullMQ job`);
        assert.equal(initialJob.data.processingRunId, runId, `${testCase.id}: BullMQ job/run identity mismatch`);

        const terminal = await waitForTerminal(runId, testCase.id);
        const declaration = await DeclarationModel.findOne({ _id:declarationId, companyId }).lean();
        assert(declaration, `${testCase.id}: declaration disappeared`);
        const nd: any = declaration.normalizedData ?? {};
        const actualGoods = Array.isArray(nd.goodsLines) ? nd.goodsLines : [];

        const scalarChecks = Object.entries(testCase.expected)
          .filter(([field, expected]) => field !== "goodsLines" && expected !== undefined)
          .map(([field, expected]) => scalarCheck(field, readField(nd, field), expected));
        const goodsMatches = matchGoodsLines(testCase.expected.goodsLines, actualGoods);
        const goodsChecks = goodsMatches.flatMap((match) => match.checks);
        const extractionChecks = [...scalarChecks, ...goodsChecks];
        const reviewChecks = testCase.expectedReviewFields.map((field) => reviewCheck(nd, field));

        const docs = await LogicalDocumentModel.find({ companyId, declarationId }).lean();
        assert(docs.length >= 1, `${testCase.id}: no logical document materialized`);
        assert(docs.every((doc) => String(doc.uploadedFileId) === String(uploadedFileId)), `${testCase.id}: logical-document upload ownership mismatch`);
        assert(docs.every((doc) => String(doc.sourceProcessingRunId) === runId), `${testCase.id}: logical-document run ownership mismatch`);

        const audits = await DeclarationFieldResolutionRunModel.find({ companyId, declarationId }).lean();
        const assessment = classifyFailure(extractionChecks, reviewChecks);
        const result = {
          id:testCase.id,
          mode:testCase.mode,
          workerOutcome:terminal.run.status,
          processingRunAttempt:terminal.run.attempt,
          bullMqState:terminal.state,
          gatePass:assessment.pass,
          failureClasses:assessment.classes,
          failedFields:assessment.failedFields,
          failedReviewFields:assessment.failedReviewFields,
          extraction:{
            passed:extractionChecks.filter((check) => check.passed).length,
            total:extractionChecks.length,
            percent:extractionChecks.length ? Number((100 * extractionChecks.filter((check) => check.passed).length / extractionChecks.length).toFixed(1)) : 100,
            checks:extractionChecks,
            goodsMatches:goodsMatches.map((match) => ({ expectedIndex:match.expectedIndex, actualIndex:match.actualIndex })),
            actualGoodsLineCount:actualGoods.length,
          },
          failClosedReview:{
            passed:reviewChecks.filter((check) => check.passed).length,
            total:reviewChecks.length,
            checks:reviewChecks,
          },
          artifacts:{ logicalDocuments:docs.length, resolutionAudits:audits.length },
        };
        results.push(result);
        console.log(JSON.stringify({ event:"product-e2e-1.6.9.1.case.measured", ...result }, null, 2));
      } finally {
        if (processingRunId) {
          const job = await getIdpQueue().getJob(String(processingRunId));
          if (job) { try { await job.remove(); } catch { /* retained job cleanup is best-effort */ } }
        }
        await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
        await LogicalDocumentModel.deleteMany({ declarationId });
        if (processingRunId) await ProcessingRunModel.deleteMany({ _id:processingRunId });
        if (uploadedFileId) await UploadedFileModel.deleteMany({ _id:uploadedFileId });
        await DeclarationModel.deleteMany({ _id:declarationId });
      }
    }

    const extractionPassed = results.reduce((sum, result) => sum + result.extraction.passed, 0);
    const extractionTotal = results.reduce((sum, result) => sum + result.extraction.total, 0);
    const reviewPassed = results.reduce((sum, result) => sum + result.failClosedReview.passed, 0);
    const reviewTotal = results.reduce((sum, result) => sum + result.failClosedReview.total, 0);
    const passedCases = results.filter((result) => result.gatePass).length;
    const failureClassCounts = results.flatMap((result) => result.failureClasses).reduce((acc: Record<string, number>, value: string) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
    console.log(JSON.stringify({
      event:"product-e2e-1.6.9.1.semantic-failure-matrix.measured",
      gate:{
        developmentControlExcludedByDefault:"mekar-ear-0068",
        passedCases,
        failedCases:results.length - passedCases,
        fullInvoicePassPercent:results.length ? Number((100 * passedCases / results.length).toFixed(1)) : 100,
        failureClassCounts,
        tuningPolicy:"SEMANTIC_EQUIVALENCE_THEN_CLASSIFY",
      },
      corpus:{
        cases:results.length,
        completed:results.filter((result) => result.workerOutcome === ProcessingStatus.COMPLETED).length,
        reviewRequired:results.filter((result) => result.workerOutcome === ProcessingStatus.REVIEW_REQUIRED).length,
        extractionPassed, extractionTotal,
        extractionPercent:extractionTotal ? Number((100 * extractionPassed / extractionTotal).toFixed(1)) : 100,
        scalarStatusCounts:results.flatMap((result) => result.extraction.checks).filter((check:any) => !String(check.field).startsWith("goodsLines")).reduce((acc:Record<string,number>, check:any) => { const key=check.status ?? (check.passed ? "EXACT" : "MISMATCH"); acc[key]=(acc[key]??0)+1; return acc; }, {}),
        failClosedReviewPassed:reviewPassed,
        failClosedReviewTotal:reviewTotal,
        failClosedReviewPercent:reviewTotal ? Number((100 * reviewPassed / reviewTotal).toFixed(1)) : 100,
        results,
      },
      guardrails:{
        frozenGroundTruth:true,
        mekARDevelopmentControlExcludedFromDefaultGate:true,
        noPerInvoiceTuningDuringMeasurement:true,
        failureClassesReportedBeforeAnyProductionChange:true,
        semanticEquivalenceMeasurementOnly:true,
        standardCountryAndIncotermCanonicalizationOnly:true,
        productionExtractionChanged:false,
        exactSourceHashesReverifiedBeforeExecution:true,
        measurementOnly:true,
        extractionMismatchDoesNotFailHarness:true,
        realProductionQueue:true,
        externalIdpWorkerServiceRequired:true,
        realConfiguredVisionProvider:true,
        directProcessIdpJobInvocation:false,
        sourceExpectationsDerivedFromPipelineOutput:false,
        supplierSpecificRules:false,
        customerPdfsCommitted:false,
        directNormalizedWrite:false,
      },
    }, null, 2));
  } finally {
    await closeIdpQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
