import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const focusFields = [
  "parties.seller.name", "parties.seller.address", "parties.seller.country",
  "parties.buyer.name", "parties.buyer.address", "parties.buyer.country",
  "totalAmount", "grossWeight", "netWeight", "transportMode", "carrier",
  "departureVehicleId", "borderVehicleId", "vehiclePlate", "containerNo",
  "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo"
] as const;

function compactCandidate(candidate: any) {
  return {
    value: candidate?.value,
    extractor: candidate?.extractor,
    evidence: (candidate?.evidence ?? []).map((e: any) => ({ pageNumber: e?.pageNumber, contentSource: e?.contentSource }))
  };
}

function selectedFields(envelope: any) {
  return Object.fromEntries(focusFields.filter((field) => envelope?.fields?.[field]?.length).map((field) => [
    field,
    envelope.fields[field].map(compactCandidate)
  ]));
}

function resolutionView(resolution: any) {
  return Object.fromEntries(focusFields.filter((field) => resolution?.fields?.[field]).map((field) => {
    const value = resolution.fields[field];
    return [field, { status: value.status, method: value.method, value: value.value, reason: value.reason, candidateCount: value.candidates?.length ?? 0 }];
  }));
}

function resolvedValue(resolution: any, field: string): unknown {
  const item = resolution?.fields?.[field];
  return item?.status === "RESOLVED" ? item.value : undefined;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run, "No completed ProcessingRun found for latest INVOICE upload.");
    assert(run.canonicalDocument?.pages?.length, "ProcessingRun has no persisted canonicalDocument; replay cannot run without OCR/Qwen.");
    assert(run.declarationCandidates?.fields, "ProcessingRun has no persisted declarationCandidates to replay.");

    // declarationCandidates retain FieldCandidate evidence plus declaration provenance.
    // The role guard only reads fields/evidence, so replaying this persisted envelope
    // exercises the current semantic authority without model inference or DB writes.
    const before = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
    const guarded = enforceVisionDocumentRoleAuthority(before as any, run.canonicalDocument as CanonicalDocument) as any as DeclarationFieldCandidateEnvelope;

    // Recompute cheap deterministic evidence from the persisted canonical document.
    // This is the important replay property: parser/authority fixes can be tested
    // against the real invoice without OCR, Vision or a database mutation.
    const segmentId = Object.values(before.fields).flat()[0]?.evidence?.[0]?.segmentId ?? "segment-001";
    const commercial = discoverInvoiceCommercialTermsFieldCandidates(run.canonicalDocument as CanonicalDocument, segmentId);
    const total = commercial.fields["header.totalAmount"]?.[0];
    const fields: any = Object.fromEntries(Object.entries(guarded.fields).map(([field, candidates]) => [field, [...candidates]]));
    if (total) {
      const provenance = Object.values(before.fields).flat()[0];
      assert(provenance, "Persisted declaration candidates have no provenance template.");
      (fields.totalAmount ??= []).push({
        ...total,
        candidateId: `${total.candidateId}:f6-totalAmount`,
        field: "totalAmount",
        logicalDocumentId: provenance.logicalDocumentId,
        uploadedFileId: provenance.uploadedFileId,
        documentType: provenance.documentType,
        sourceProcessingRunId: provenance.sourceProcessingRunId
      });
    }
    const replayCandidates = { ...guarded, fields } as DeclarationFieldCandidateEnvelope;
    const candidateSelections = selectDirectSourceEvidenceAuthority(replayCandidates as any);
    const resolution = resolveDeclarationFields({ candidates: replayCandidates, candidateSelections });

    const poison = {
      transportMode: resolvedValue(resolution, "transportMode") === "Bin",
      carrierIsBuyerAddress: String(resolvedValue(resolution, "carrier") ?? "").includes("Punane 73"),
      shortTwoTransportFields: ["departureVehicleId", "borderVehicleId", "vehiclePlate", "containerNo", "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo"]
        .filter((field) => String(resolvedValue(resolution, field) ?? "") === "2")
    };
    const golden = {
      seller: String(resolvedValue(resolution, "parties.seller.name") ?? "").toLocaleUpperCase("tr-TR").includes("VEKMAR"),
      buyer: String(resolvedValue(resolution, "parties.buyer.name") ?? "").toLocaleUpperCase("tr-TR").includes("POWER TECHNOLOGY"),
      totalAmount: Number(resolvedValue(resolution, "totalAmount")) === 31081.1,
      grossWeight: Number(resolvedValue(resolution, "grossWeight")) === 554,
      netWeight: Number(resolvedValue(resolution, "netWeight")) === 530
    };

    const safetyPassed = !poison.transportMode && !poison.carrierIsBuyerAddress && poison.shortTwoTransportFields.length === 0;
    const goldenPassed = Object.values(golden).every(Boolean);
    console.log(JSON.stringify({
      event: "product-e2e-1.8.17.persisted-authority-replay.completed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      before: selectedFields(before),
      afterRoleGuard: selectedFields(guarded),
      replayCandidates: selectedFields(replayCandidates),
      candidateSelections,
      replayResolution: resolutionView(resolution),
      acceptance: { safetyPassed, goldenPassed, poison, golden },
      guardrails: { persistedCanonicalEvidenceOnly: true, recomputesDeterministicParsers: true, rerunsOcr: false, rerunsLlm: false, mutatesDatabase: false }
    }, null, 2));

    // Safety regressions are hard failures. Missing desired values intentionally
    // remain diagnostic: they drive the next fast authority fix without forcing
    // another expensive document/model run.
    assert(safetyPassed, `Persisted replay still promotes unsupported transport evidence: ${JSON.stringify(poison)}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
