import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { sanitizeVisionPaymentType, sanitizeVisionBankInfo } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { sanitizeVisionCommercialSemanticCandidates } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const wanted = new Set(["paymentType", "bankInfo", "trade.paymentType", "finance.bankInfo"]);

function compactCandidate(c: any) {
  return {
    candidateId: c?.candidateId ?? null,
    field: c?.field ?? null,
    value: c?.value ?? null,
    extractor: c?.extractor ?? null,
    confidence: c?.confidence ?? null,
    derived: c?.derived ?? null,
    evidence: Array.isArray(c?.evidence) ? c.evidence.map((e: any) => ({
      pageNumber: e?.pageNumber ?? null,
      contentSource: e?.contentSource ?? null,
      text: e?.text ?? null,
      quote: e?.quote ?? null
    })) : []
  };
}

function envelopeFields(envelope: any) {
  if (!envelope?.fields || typeof envelope.fields !== "object") return {};
  return Object.fromEntries([...wanted]
    .filter((field) => Array.isArray(envelope.fields[field]) && envelope.fields[field].length)
    .map((field) => [field, envelope.fields[field].map(compactCandidate)]));
}

function segmentFields(run: any) {
  const segments = run?.candidates?.segments;
  if (!Array.isArray(segments)) return [];
  return segments.map((segment: any) => ({
    segmentId: segment?.segmentId ?? null,
    extractor: segment?.extractor ?? null,
    fields: envelopeFields(segment?.data?.fieldCandidates),
    deterministicCommercialAudit: envelopeFields(segment?.data?.genericCandidateAudit?.commercialTermsCandidates)
  }));
}

function collectCommercialOccurrences(root: any, max = 120) {
  const out: Array<{path: string; value: unknown}> = [];
  const seen = new Set<any>();
  const walk = (value: any, path: string, depth: number) => {
    if (out.length >= max || depth > 12 || value === null || value === undefined) return;
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if ((key === "paymentType" || key === "bankInfo") && child !== undefined) {
        if (Array.isArray(child)) out.push({ path: childPath, value: child.map((x: any) => x?.value ?? x) });
        else if (child && typeof child === "object" && "value" in (child as any)) out.push({ path: childPath, value: (child as any).value });
        else out.push({ path: childPath, value: child });
      }
      walk(child, childPath, depth + 1);
    }
  };
  walk(root, "", 0);
  return out;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    if (!upload) throw new Error("No persisted INVOICE upload found");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id }).sort({ createdAt: -1 }).lean();
    if (!run) throw new Error("No ProcessingRun found for latest INVOICE upload");
    const declaration: any = await DeclarationModel.findById(upload.declarationId).lean();
    if (!declaration) throw new Error("Declaration not found for latest INVOICE upload");
    const resolutions: any[] = await DeclarationFieldResolutionRunModel.find({ declarationId: upload.declarationId }).sort({ createdAt: 1 }).lean();
    const latestResolution: any = resolutions.at(-1);

    const poisonEnvelope: any = {
      version: "1",
      fields: {
        paymentType: [{ candidateId: "probe-payment", field: "paymentType", value: "0,00 EUR", confidence: 1, extractor: "probe", evidence: [] }],
        bankInfo: [{ candidateId: "probe-bank", field: "bankInfo", value: "0,00 EUR", confidence: 1, extractor: "probe", evidence: [] }]
      }
    };
    const runtimeSanitized = sanitizeVisionCommercialSemanticCandidates(poisonEnvelope);

    const paymentResolution = latestResolution?.resolution?.fields?.paymentType ?? null;
    const bankResolution = latestResolution?.resolution?.fields?.bankInfo ?? null;
    const finalPayment = declaration?.normalizedData?.trade?.paymentType ?? null;
    const finalBank = declaration?.normalizedData?.finance?.bankInfo ?? null;
    const workerPayment = run?.declarationCandidates?.fields?.paymentType ?? [];
    const workerBank = run?.declarationCandidates?.fields?.bankInfo ?? [];
    const poison = (xs: any[]) => xs.some((c: any) => String(c?.value ?? "").trim() === "0,00 EUR");

    const runtimeProbe = {
      paymentDirect: sanitizeVisionPaymentType("0,00 EUR") ?? null,
      bankDirect: sanitizeVisionBankInfo("0,00 EUR") ?? null,
      boundaryPaymentCandidateCount: runtimeSanitized.fields.paymentType?.length ?? 0,
      boundaryBankCandidateCount: runtimeSanitized.fields.bankInfo?.length ?? 0,
      sanitizerLoadedAndRejectsMonetaryPoison:
        sanitizeVisionPaymentType("0,00 EUR") === undefined &&
        sanitizeVisionBankInfo("0,00 EUR") === undefined &&
        !runtimeSanitized.fields.paymentType && !runtimeSanitized.fields.bankInfo
    };

    const persistedWorkerPoison = { paymentType: poison(workerPayment), bankInfo: poison(workerBank) };
    const finalPoison = {
      paymentType: String(finalPayment ?? "").trim() === "0,00 EUR",
      bankInfo: String(finalBank ?? "").trim() === "0,00 EUR"
    };

    let diagnosis: string;
    if (!runtimeProbe.sanitizerLoadedAndRejectsMonetaryPoison) {
      diagnosis = "RUNTIME_CODE_MISMATCH_OR_SANITIZER_REGRESSION";
    } else if (persistedWorkerPoison.paymentType || persistedWorkerPoison.bankInfo) {
      diagnosis = "POISON_PERSISTED_DESPITE_CURRENT_SANITIZER__TRACE_WORKER_FUSION_OR_STALE_JOB_RUNTIME";
    } else if (finalPoison.paymentType || finalPoison.bankInfo) {
      diagnosis = "WORKER_PERSISTENCE_CLEAN_BUT_DECLARATION_OVERWRITTEN_LATER__TRACE_F6_PROMOTION_OR_SECOND_NORMALIZED_WRITER";
    } else {
      diagnosis = "FRESH_COMMERCIAL_PATH_CLEAN";
    }

    console.log(JSON.stringify({
      event: "product-e2e-1.8.47.fresh-commercial-forensic-trace.diagnosed",
      identity: {
        upload: { id: String(upload._id), fileName: upload.fileName, declarationId: String(upload.declarationId), createdAt: upload.createdAt },
        run: { id: String(run._id), status: run.status, createdAt: run.createdAt, completedAt: run.completedAt, processorVersion: run.processorVersion ?? null },
        declaration: { id: String(declaration._id), referenceNo: declaration.referenceNo ?? declaration.reference ?? declaration.ref ?? null, updatedAt: declaration.updatedAt ?? null },
        latestResolution: latestResolution ? { id: String(latestResolution._id), createdAt: latestResolution.createdAt ?? null } : null
      },
      runtimeProbe,
      visionCheckpointOccurrences: collectCommercialOccurrences(run?.visionCandidateCheckpoint),
      modelArtifactOccurrences: collectCommercialOccurrences(run?.modelExtractionArtifacts),
      workerSegmentCandidates: segmentFields(run),
      persistedDeclarationCandidates: {
        paymentType: workerPayment.map(compactCandidate),
        bankInfo: workerBank.map(compactCandidate)
      },
      persistedRawExtractionOccurrences: collectCommercialOccurrences(run?.rawExtraction),
      persistedFinalResultOccurrences: collectCommercialOccurrences(run?.finalResult),
      f6: {
        resolutionRunCount: resolutions.length,
        paymentType: paymentResolution,
        bankInfo: bankResolution
      },
      declarationFinal: {
        paymentType: finalPayment,
        bankInfo: finalBank,
        paymentSourceTrace: declaration?.sourceTrace?.["trade.paymentType"] ?? null,
        bankSourceTrace: declaration?.sourceTrace?.["finance.bankInfo"] ?? null
      },
      poisonFlags: { persistedWorker: persistedWorkerPoison, final: finalPoison },
      diagnosis,
      architectureWarning: "Current project also contains runNormalize(), which rebuilds Declaration.normalizedData and saves it directly. That is a second normalized-data writer beside Foundation 6 promotion and must be reconciled after this trace; no change is made by this diagnostic.",
      guardrails: {
        diagnosticOnly: true,
        latestFreshPersistedState: true,
        runtimeSanitizerProbeOnly: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        supplierSpecificRules: false,
        invoiceSpecificConstants: false,
        directNormalizedWrite: false
      }
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
