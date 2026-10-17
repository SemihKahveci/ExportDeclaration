import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidate, DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { canonicalCommercialTermsCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { sanitizeVisionBankInfo, sanitizeVisionPaymentType } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

const focus = ["paymentType", "freight", "insurance", "bankInfo", "totalAmount", "currency", "exchangeRate", "deliveryTerm"] as const;

function resolvedValue(resolution: any, field: string): unknown {
  const item = resolution?.fields?.[field];
  return item?.status === "RESOLVED" ? item.value : undefined;
}

function money(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function semanticText(value: unknown): string {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run, "No completed ProcessingRun found for latest INVOICE upload.");
    assert(run.canonicalDocument?.pages?.length, "Latest run has no persisted canonicalDocument.");
    assert(run.declarationCandidates?.fields, "Latest run has no persisted declarationCandidates.");

    const before = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
    const provenance = Object.values(before.fields).flat()[0];
    assert(provenance, "Persisted declaration candidates have no provenance template.");
    const segmentId = provenance.evidence?.[0]?.segmentId ?? "segment-001";

    // Re-run only the current deterministic commercial parser against persisted
    // canonical evidence. No OCR/model/provider is invoked here.
    const deterministic = discoverInvoiceCommercialTermsFieldCandidates(run.canonicalDocument as CanonicalDocument, segmentId);
    const bridged = canonicalCommercialTermsCandidatesOf({ genericCandidateAudit: { commercialTermsCandidates: deterministic } });

    // Simulate the current 1.8.30 Vision sanitizers on the already-persisted
    // candidate envelope. This is necessary because the source run predates
    // 1.8.30 and may contain the old "0,00 EUR" payment/bank poison.
    const fields: Record<string, DeclarationFieldCandidate[]> = {};
    for (const [field, candidates] of Object.entries(before.fields)) {
      fields[field] = candidates.filter((candidate) => {
        if (field === "paymentType" && candidate.evidence.some((e) => e.contentSource === "PAGE_IMAGE")) {
          return sanitizeVisionPaymentType(candidate.value) !== undefined;
        }
        if (field === "bankInfo" && candidate.evidence.some((e) => e.contentSource === "PAGE_IMAGE")) {
          return sanitizeVisionBankInfo(candidate.value) !== undefined;
        }
        return true;
      });
    }

    for (const [field, candidates] of Object.entries(bridged.fields)) {
      const target = (fields[field] ??= []);
      const known = new Set(target.map((candidate) => candidate.candidateId));
      for (const candidate of candidates) {
        if (known.has(candidate.candidateId)) continue;
        target.push({
          ...candidate,
          logicalDocumentId: provenance.logicalDocumentId,
          uploadedFileId: provenance.uploadedFileId,
          documentType: provenance.documentType,
          sourceProcessingRunId: provenance.sourceProcessingRunId
        });
        known.add(candidate.candidateId);
      }
    }

    const replayCandidates: DeclarationFieldCandidateEnvelope = { ...before, fields };
    const candidateSelections = selectDirectSourceEvidenceAuthority(replayCandidates as any);
    const resolution = resolveDeclarationFields({ candidates: replayCandidates, candidateSelections });
    const resolved = Object.fromEntries(focus.map((field) => [field, resolvedValue(resolution, field)]));

    const acceptance = {
      paymentType: semanticText(resolved.paymentType).includes("PESIN ODEME"),
      freight: money(resolved.freight) === 0,
      insurance: money(resolved.insurance) === 0,
      bankInfoAbsent: resolved.bankInfo === undefined,
      totalAmount: money(resolved.totalAmount) === 31081.1,
      currency: resolved.currency === "EUR",
      exchangeRate: money(resolved.exchangeRate) === 53.3268,
      deliveryTerm: resolved.deliveryTerm === "FCA"
    };

    const poisonedPersistedVision = {
      paymentType: (before.fields.paymentType ?? []).filter((candidate) => sanitizeVisionPaymentType(candidate.value) === undefined).map((candidate) => candidate.value),
      bankInfo: (before.fields.bankInfo ?? []).filter((candidate) => sanitizeVisionBankInfo(candidate.value) === undefined).map((candidate) => candidate.value)
    };

    assert(Object.values(acceptance).every(Boolean), `Commercial semantic replay failed: ${JSON.stringify(acceptance)}`);

    console.log(JSON.stringify({
      event: "product-e2e-1.8.31.1.persisted-commercial-semantic-authority-replay.passed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      deterministicFields: Object.fromEntries(Object.entries(deterministic.fields).map(([field, candidates]) => [field, candidates.map((candidate) => candidate.value)])),
      bridgedFields: Object.fromEntries(Object.entries(bridged.fields).map(([field, candidates]) => [field, candidates.map((candidate) => candidate.value)])),
      resolvedValues: resolved,
      rejectedPersistedVisionPoison: poisonedPersistedVision,
      acceptance,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        currentGeneralDeterministicParserOnly: true,
        currentVisionSanitizersAppliedInMemory: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        supplierSpecificRules: false,
        invoiceSpecificConstantsInProduction: false,
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
