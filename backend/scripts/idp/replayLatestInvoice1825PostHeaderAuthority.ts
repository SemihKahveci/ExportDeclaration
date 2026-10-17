import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const TARGETS = [
  "parties.seller.name", "parties.seller.address", "parties.seller.country",
  "parties.buyer.name", "parties.buyer.address", "parties.buyer.country",
  "invoiceNo", "invoiceDate", "totalAmount", "currency", "exchangeRate",
  "grossWeight", "netWeight", "totalPackage", "packageType", "deliveryTerm",
  "transportMode", "carrier", "departureVehicleId", "borderVehicleId", "vehiclePlate",
  "containerNo", "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo",
] as const;

const headerFieldMap: Readonly<Record<string, string>> = {
  "header.invoiceNo": "invoiceNo",
  "header.invoiceDate": "invoiceDate",
  "parties.seller.name": "parties.seller.name",
  "parties.seller.address": "parties.seller.address",
  "parties.seller.country": "parties.seller.country",
  "parties.buyer.name": "parties.buyer.name",
  "parties.buyer.address": "parties.buyer.address",
  "parties.buyer.country": "parties.buyer.country",
};

function cloneFields(envelope: DeclarationFieldCandidateEnvelope): Record<string, any[]> {
  return Object.fromEntries(Object.entries(envelope.fields).map(([field, candidates]) => [field, [...candidates]]));
}

function provenanceTemplate(envelope: DeclarationFieldCandidateEnvelope): any {
  return Object.values(envelope.fields).flat()[0];
}

function addCurrentHeaderAuthority(
  fields: Record<string, any[]>,
  canonical: CanonicalDocument,
  segmentId: string,
  provenance: any,
) {
  const discovered = discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId);
  const promoted: Record<string, unknown[]> = {};
  for (const [sourceField, candidates] of Object.entries(discovered.fields)) {
    const target = headerFieldMap[sourceField];
    if (!target) continue;
    const mapped = candidates.map((candidate) => ({
      ...candidate,
      candidateId: `${candidate.candidateId}:f6-header-party`,
      field: target,
      logicalDocumentId: provenance.logicalDocumentId,
      uploadedFileId: provenance.uploadedFileId,
      documentType: provenance.documentType,
      sourceProcessingRunId: provenance.sourceProcessingRunId,
    }));
    const targetCandidates = (fields[target] ??= []);
    const existingIds = new Set(targetCandidates.map((candidate) => candidate.candidateId));
    for (const candidate of mapped) {
      if (!existingIds.has(candidate.candidateId)) {
        targetCandidates.push(candidate);
        existingIds.add(candidate.candidateId);
      }
    }
    promoted[target] = mapped.map((candidate) => candidate.value);
  }
  return promoted;
}

function addCurrentCommercialAuthority(
  fields: Record<string, any[]>,
  canonical: CanonicalDocument,
  segmentId: string,
  provenance: any,
) {
  const discovered = discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId);
  const fieldMap: Readonly<Record<string, string>> = {
    "trade.deliveryTerm": "deliveryTerm",
    "finance.bankInfo": "bankInfo",
    "header.totalAmount": "totalAmount",
    "header.currency": "currency",
    "finance.exchangeRate": "exchangeRate",
  };
  const promoted: Record<string, unknown[]> = {};
  for (const [sourceField, candidates] of Object.entries(discovered.fields)) {
    const target = fieldMap[sourceField];
    if (!target) continue;
    const mapped = candidates.map((candidate) => ({
      ...candidate,
      candidateId: `${candidate.candidateId}:f6-${target}`,
      field: target,
      logicalDocumentId: provenance.logicalDocumentId,
      uploadedFileId: provenance.uploadedFileId,
      documentType: provenance.documentType,
      sourceProcessingRunId: provenance.sourceProcessingRunId,
    }));
    const targetCandidates = (fields[target] ??= []);
    const existingIds = new Set(targetCandidates.map((candidate) => candidate.candidateId));
    for (const candidate of mapped) {
      if (!existingIds.has(candidate.candidateId)) {
        targetCandidates.push(candidate);
        existingIds.add(candidate.candidateId);
      }
    }
    promoted[target] = mapped.map((candidate) => candidate.value);
  }
  return promoted;
}

function resolutionView(resolution: any, field: string) {
  const item = resolution?.fields?.[field];
  if (!item) return undefined;
  return {
    status: item.status,
    method: item.method,
    value: item.value,
    reason: item.reason,
    candidateCount: item.candidates?.length ?? 0,
  };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run, "No completed ProcessingRun found for latest INVOICE upload.");
    assert(run.canonicalDocument?.pages?.length, "ProcessingRun has no persisted canonicalDocument.");
    assert(run.declarationCandidates?.fields, "ProcessingRun has no persisted declarationCandidates.");

    const canonical = run.canonicalDocument as CanonicalDocument;
    const before = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
    const guarded = enforceVisionDocumentRoleAuthority(before as any, canonical) as any as DeclarationFieldCandidateEnvelope;
    const provenance = provenanceTemplate(before);
    assert(provenance, "Persisted declaration candidates have no provenance template.");
    const segmentId = provenance.evidence?.[0]?.segmentId ?? "segment-001";

    const fields = cloneFields(guarded);
    const currentHeaderAuthority = addCurrentHeaderAuthority(fields, canonical, segmentId, provenance);
    const currentCommercialAuthority = addCurrentCommercialAuthority(fields, canonical, segmentId, provenance);
    const replayCandidates = { ...guarded, fields } as DeclarationFieldCandidateEnvelope;
    const candidateSelections = selectDirectSourceEvidenceAuthority(replayCandidates as any);
    const resolution = resolveDeclarationFields({ candidates: replayCandidates, candidateSelections });

    const classification = TARGETS.map((field) => {
      const guardedCount = guarded.fields[field]?.length ?? 0;
      const deterministicValues = [
        ...(currentHeaderAuthority[field] ?? []),
        ...(currentCommercialAuthority[field] ?? []),
      ];
      const resolved = resolutionView(resolution, field);
      const bucket = deterministicValues.length > 0
        ? (resolved?.status === "RESOLVED" ? "DETERMINISTIC_AUTHORITY_RESOLVED" : "DETERMINISTIC_AUTHORITY_STILL_UNRESOLVED")
        : guardedCount > 0
          ? (resolved?.status === "RESOLVED" ? "ROLE_GUARDED_VISION_RESOLVED" : "ROLE_GUARDED_VISION_UNRESOLVED")
          : "NO_CURRENT_SOURCE_CANDIDATE";
      return { field, bucket, deterministicValues, guardedVisionCandidateCount: guardedCount, resolution: resolved };
    });

    const headerAuthorityFields = Object.keys(currentHeaderAuthority);
    const failedHeaderAuthority = classification.filter((row) => headerAuthorityFields.includes(row.field) && row.bucket !== "DETERMINISTIC_AUTHORITY_RESOLVED");
    assert.equal(failedHeaderAuthority.length, 0, `1.8.24 real persisted replay left deterministic header authority unresolved: ${JSON.stringify(failedHeaderAuthority)}`);

    const buckets = classification.reduce<Record<string, string[]>>((acc, row) => {
      (acc[row.bucket] ??= []).push(row.field);
      return acc;
    }, {});

    console.log(JSON.stringify({
      event: "product-e2e-1.8.25.post-header-authority-replay.passed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary: {
        targetFieldCount: TARGETS.length,
        deterministicHeaderAuthorityFieldCount: headerAuthorityFields.length,
        deterministicCommercialAuthorityFieldCount: Object.keys(currentCommercialAuthority).length,
        bucketCounts: Object.fromEntries(Object.entries(buckets).map(([bucket, fields]) => [bucket, fields.length])),
      },
      currentHeaderAuthority,
      currentCommercialAuthority,
      buckets,
      classification,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        currentGeneralDeterministicParsersOnly: true,
        supplierSpecificRules: false,
        invoiceSpecificConstants: false,
        ocrOrModelInference: false,
        databaseMutation: false,
        directNormalizedWrite: false,
      },
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
