import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";

const TARGETS = [
  "parties.seller.name", "parties.seller.address", "parties.seller.country",
  "parties.buyer.name", "parties.buyer.address", "parties.buyer.country",
  "header.invoiceNo", "header.invoiceDate", "totalAmount", "currency", "exchangeRate",
  "grossWeight", "netWeight", "totalPackage", "packageType", "deliveryTerm",
  "transportMode", "carrier", "departureVehicleId", "borderVehicleId", "vehiclePlate",
  "containerNo", "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo",
] as const;

function compactCandidate(c: any) {
  return {
    value: c?.value,
    confidence: c?.confidence,
    extractor: c?.extractor,
    evidence: (c?.evidence ?? []).map((e: any) => ({
      pageNumber: e?.pageNumber,
      contentSource: e?.contentSource,
      text: e?.text,
      quote: e?.quote,
    })),
  };
}

function fieldMap(...envelopes: any[]) {
  const out: Record<string, any[]> = {};
  for (const key of TARGETS) {
    const candidates = envelopes.flatMap(e => e?.fields?.[key] ?? []);
    if (candidates.length) out[key] = candidates.map(compactCandidate);
  }
  return out;
}

function latestResolutionValue(resolutionRuns: any[], field: string) {
  for (let i = resolutionRuns.length - 1; i >= 0; i--) {
    const r = resolutionRuns[i]?.resolution;
    if (r?.fields?.[field] !== undefined) return r.fields[field];
  }
  return undefined;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    if (!upload) throw new Error("No persisted INVOICE upload found");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id }).sort({ createdAt: -1 }).lean();
    if (!run) throw new Error("No ProcessingRun found for latest INVOICE upload");

    const segments = Array.isArray(run?.candidates?.segments) ? run.candidates.segments : [];
    const segmentId = String(segments?.[0]?.segmentId ?? "invoice");
    const persistedAudit = segments.map((s: any) => s?.data?.genericCandidateAudit).find(Boolean);
    const canonical: any = run.canonicalDocument;

    const header = discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId);
    const shipment = discoverInvoiceShipmentFieldCandidates(canonical, segmentId);
    const commercial = discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId);
    const currentDeterministic = fieldMap(header, shipment, commercial);
    const persistedDeterministic = fieldMap(
      persistedAudit?.headerPartyCandidates,
      persistedAudit?.shipmentCandidates,
      persistedAudit?.commercialTermsCandidates,
    );

    const resolutionRuns: any[] = await DeclarationFieldResolutionRunModel.find({ declarationId: upload.declarationId })
      .sort({ createdAt: 1 }).lean();
    const latestReview = new Set<string>(resolutionRuns.at(-1)?.resolution?.reviewRequiredFields ?? []);

    const coverage = TARGETS.map(field => ({
      field,
      currentDeterministic: currentDeterministic[field]?.map(x => x.value) ?? [],
      persistedDeterministic: persistedDeterministic[field]?.map(x => x.value) ?? [],
      foundation6Value: latestResolutionValue(resolutionRuns, field),
      foundation6ReviewRequired: latestReview.has(field),
    }));

    const sourcePresentButUnresolved = coverage.filter(x => x.currentDeterministic.length > 0 && (x.foundation6Value === undefined || x.foundation6ReviewRequired));
    const noDeterministicCandidate = coverage.filter(x => x.currentDeterministic.length === 0);
    const stalePersisted = coverage.filter(x => JSON.stringify(x.currentDeterministic) !== JSON.stringify(x.persistedDeterministic));

    console.log(JSON.stringify({
      event: "product-e2e-1.8.23.persisted-header-authority-replay.completed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary: {
        targetFieldCount: TARGETS.length,
        currentDeterministicFieldCount: coverage.filter(x => x.currentDeterministic.length > 0).length,
        sourcePresentButUnresolvedCount: sourcePresentButUnresolved.length,
        noDeterministicCandidateCount: noDeterministicCandidate.length,
        stalePersistedFieldCount: stalePersisted.length,
      },
      sourcePresentButUnresolved,
      noDeterministicCandidate: noDeterministicCandidate.map(x => x.field),
      stalePersisted,
      currentDeterministic,
      coverage,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        deterministicDiscoveryOnly: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        directNormalizedWrite: false,
      },
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async error => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exitCode = 1;
});
