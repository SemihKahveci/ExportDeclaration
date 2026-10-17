import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";
import {
  canonicalCommercialTermsCandidatesOf,
  canonicalHeaderPartyCandidatesOf,
  canonicalNativeGoodsCodeCandidatesOf,
  canonicalNativeShipmentCandidatesOf,
  canonicalValidatedNativeGoodsRowCandidatesOf,
  enforceVisionDocumentRoleAuthority,
} from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const mergeUnique = (...envelopes: DeclarationFieldCandidateEnvelope[]): DeclarationFieldCandidateEnvelope => {
  const fields: Record<string, any[]> = {};
  const seen = new Set<string>();
  for (const envelope of envelopes) {
    for (const [field, candidates] of Object.entries(envelope.fields ?? {})) {
      for (const candidate of candidates) {
        if (seen.has(candidate.candidateId)) continue;
        seen.add(candidate.candidateId);
        (fields[field] ??= []).push(candidate);
      }
    }
  }
  return { version: "1", fields } as DeclarationFieldCandidateEnvelope;
};

const resolved = (resolution: any, field: string) => resolution?.fields?.[field]?.status === "RESOLVED";
const valueOf = (resolution: any, field: string) => resolved(resolution, field) ? resolution.fields[field].value : undefined;

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run?.canonicalDocument?.pages?.length, "Latest completed run has no persisted canonical document.");
    assert(run?.declarationCandidates?.fields, "Latest completed run has no persisted declaration candidates.");

    const canonical = run.canonicalDocument as CanonicalDocument;
    const persisted = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
    const provenance: any = Object.values(persisted.fields).flat()[0];
    const segmentId = provenance?.evidence?.[0]?.segmentId ?? "segment-001";

    const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
    const authorityData = {
      genericCandidateAudit: {
        candidates: generic,
        validation: validateGenericInvoiceEvidence(canonical, generic),
        headerPartyCandidates: discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId),
        commercialTermsCandidates: discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId),
        shipmentCandidates: discoverInvoiceShipmentFieldCandidates(canonical, segmentId),
      },
    };

    const nativeHs = canonicalNativeGoodsCodeCandidatesOf(authorityData);
    const nativeRows = canonicalValidatedNativeGoodsRowCandidatesOf(authorityData);
    const nativeHeader = canonicalHeaderPartyCandidatesOf(authorityData);
    const nativeCommercial = canonicalCommercialTermsCandidatesOf(authorityData);
    const nativeShipment = canonicalNativeShipmentCandidatesOf(authorityData);
    const guardedVision = enforceVisionDocumentRoleAuthority(persisted as any, canonical) as any as DeclarationFieldCandidateEnvelope;

    // Production candidates carry document provenance. Replay the current bridge
    // without mutating persistence by borrowing provenance from the persisted run.
    const withProvenance = (envelope: DeclarationFieldCandidateEnvelope): DeclarationFieldCandidateEnvelope => ({
      ...envelope,
      fields: Object.fromEntries(Object.entries(envelope.fields).map(([field, candidates]) => [field, candidates.map((candidate: any) => ({
        ...candidate,
        logicalDocumentId: candidate.logicalDocumentId ?? provenance?.logicalDocumentId,
        uploadedFileId: candidate.uploadedFileId ?? provenance?.uploadedFileId,
        documentType: candidate.documentType ?? provenance?.documentType,
        sourceProcessingRunId: candidate.sourceProcessingRunId ?? provenance?.sourceProcessingRunId,
      }))])),
    });

    const replayCandidates = mergeUnique(
      guardedVision,
      withProvenance(nativeCommercial as any),
      withProvenance(nativeHeader as any),
      withProvenance(nativeShipment as any),
      withProvenance(nativeHs as any),
      withProvenance(nativeRows as any),
    );
    const candidateSelections = selectDirectSourceEvidenceAuthority(replayCandidates as any);
    const resolution = resolveDeclarationFields({ candidates: replayCandidates, candidateSelections });

    const hsFields = Object.keys(nativeHs.fields).sort();
    const unresolvedHs = hsFields.filter((field) => !resolved(resolution, field));
    const headerFields = Object.keys(nativeHeader.fields).sort();
    const unresolvedHeader = headerFields.filter((field) => !resolved(resolution, field));
    const shipmentFields = Object.keys(nativeShipment.fields).sort();
    const unresolvedShipment = shipmentFields.filter((field) => !resolved(resolution, field));
    const commercialFields = Object.keys(nativeCommercial.fields).sort();
    const unresolvedCommercial = commercialFields.filter((field) => !resolved(resolution, field));

    assert(hsFields.length > 0, "Canonical replay produced no native GTIP authority candidates.");
    assert.equal(unresolvedHs.length, 0, `Native GTIP authority still unresolved: ${unresolvedHs.join(", ")}`);
    assert.equal(unresolvedHeader.length, 0, `Native header authority still unresolved: ${unresolvedHeader.join(", ")}`);
    assert.equal(unresolvedShipment.length, 0, `Native shipment authority still unresolved: ${unresolvedShipment.join(", ")}`);
    assert.equal(unresolvedCommercial.length, 0, `Native commercial authority still unresolved: ${unresolvedCommercial.join(", ")}`);

    const interesting = [
      "parties.seller.name", "parties.seller.address", "parties.seller.country",
      "parties.buyer.name", "parties.buyer.address", "parties.buyer.country",
      "transportMode", "deliveryTerm", "totalPackage", "packageType", "grossWeight", "netWeight",
      "totalAmount", "currency", "exchangeRate",
    ];

    console.log(JSON.stringify({
      event: "product-e2e-1.8.29.persisted-canonical-authority-end-to-end-replay.passed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary: {
        nativeGtipAuthorityCount: hsFields.length,
        resolvedNativeGtipCount: hsFields.length - unresolvedHs.length,
        nativeHeaderAuthorityFieldCount: headerFields.length,
        resolvedNativeHeaderFieldCount: headerFields.length - unresolvedHeader.length,
        nativeShipmentAuthorityFieldCount: shipmentFields.length,
        resolvedNativeShipmentFieldCount: shipmentFields.length - unresolvedShipment.length,
        nativeCommercialAuthorityFieldCount: commercialFields.length,
        resolvedNativeCommercialFieldCount: commercialFields.length - unresolvedCommercial.length,
      },
      resolvedValues: Object.fromEntries(interesting.map((field) => [field, valueOf(resolution, field)]).filter(([, value]) => value !== undefined)),
      unresolved: { gtip: unresolvedHs, header: unresolvedHeader, shipment: unresolvedShipment, commercial: unresolvedCommercial },
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        currentGeneralDeterministicParsersOnly: true,
        modelSizeIndependent: true,
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
