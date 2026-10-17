import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidate, DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceOriginFieldCandidates } from "../../src/modules/idp/candidates/invoiceOriginCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";
import {
  canonicalCommercialTermsCandidatesOf,
  canonicalHeaderPartyCandidatesOf,
  canonicalNativeGoodsCodeCandidatesOf,
  canonicalNativeShipmentCandidatesOf,
  canonicalValidatedNativeGoodsRowCandidatesOf,
  canonicalValidatedNativeGoodsOriginCandidatesOf
} from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { sanitizeVisionBankInfo, sanitizeVisionPaymentType } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";

const scalarFields = [
  "invoiceNo", "invoiceDate", "parties.seller.name", "parties.seller.address", "parties.seller.country",
  "parties.buyer.name", "parties.buyer.address", "parties.buyer.country", "totalAmount", "currency",
  "deliveryTerm", "paymentType", "transportMode", "originCountry", "exitCountry", "arrivalCountry",
  "destinationCountry", "tradeCountry", "carrier", "departureVehicleId", "borderVehicleId", "vehiclePlate",
  "containerNo", "billOfLadingNo", "cmrNo", "awbNo", "transportDocumentNo", "exchangeRate", "freight",
  "insurance", "bankInfo", "totalPackage", "packageType", "grossWeight", "netWeight"
] as const;
const goodsCore = ["hsCode", "productCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const;
const goodsField = /^goodsLines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal)$/;

function addProvenance(envelope: any, provenance: any, runId: string): DeclarationFieldCandidateEnvelope {
  return {
    version: "1",
    fields: Object.fromEntries(Object.entries(envelope.fields ?? {}).map(([field, candidates]: any) => [
      field,
      candidates.map((candidate: any) => ({
        ...candidate,
        logicalDocumentId: provenance.logicalDocumentId,
        uploadedFileId: provenance.uploadedFileId,
        documentType: provenance.documentType ?? "INVOICE",
        sourceProcessingRunId: provenance.sourceProcessingRunId ?? runId
      }))
    ]))
  } as DeclarationFieldCandidateEnvelope;
}

function merge(...envelopes: DeclarationFieldCandidateEnvelope[]): Record<string, DeclarationFieldCandidate[]> {
  const fields: Record<string, DeclarationFieldCandidate[]> = {};
  for (const envelope of envelopes) for (const [field, candidates] of Object.entries(envelope.fields ?? {})) {
    const target = fields[field] ??= [];
    const ids = new Set(target.map((candidate) => candidate.candidateId));
    for (const candidate of candidates) if (!ids.has(candidate.candidateId)) { target.push(candidate); ids.add(candidate.candidateId); }
  }
  return fields;
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
    assert(run?.canonicalDocument?.pages?.length, "Latest completed run has no persisted canonicalDocument.");
    assert(run?.declarationCandidates?.fields, "Latest completed run has no persisted declarationCandidates.");

    const canonical = run.canonicalDocument as CanonicalDocument;
    const before = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
    const provenance: any = Object.values(before.fields).flat()[0];
    assert(provenance, "Persisted declaration candidates have no provenance template.");
    const segmentId = provenance.evidence?.[0]?.segmentId ?? "segment-001";

    // Rebuild every current deterministic canonical reader from persisted evidence.
    const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
    const validation = validateGenericInvoiceEvidence(canonical, generic);
    const headerParty = discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId);
    const shipment = discoverInvoiceShipmentFieldCandidates(canonical, segmentId);
    const commercial = discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId);
    const origins = discoverInvoiceOriginFieldCandidates(canonical, segmentId, generic);
    const authorityData: any = { genericCandidateAudit: { candidates: generic, validation, headerPartyCandidates: headerParty, shipmentCandidates: shipment, commercialTermsCandidates: commercial, originCandidates: origins } };

    // Persisted run predates 1.8.30. Apply the current Vision semantic sanitizers in-memory.
    const sanitizedPersisted: DeclarationFieldCandidateEnvelope = { ...before, fields: {} };
    for (const [field, candidates] of Object.entries(before.fields)) {
      sanitizedPersisted.fields[field] = candidates.filter((candidate) => {
        const vision = candidate.evidence.some((e) => e.contentSource === "PAGE_IMAGE");
        if (vision && field === "paymentType") return sanitizeVisionPaymentType(candidate.value) !== undefined;
        if (vision && field === "bankInfo") return sanitizeVisionBankInfo(candidate.value) !== undefined;
        return true;
      });
    }

    const deterministicBridges = [
      canonicalHeaderPartyCandidatesOf(authorityData),
      canonicalNativeShipmentCandidatesOf(authorityData),
      canonicalCommercialTermsCandidatesOf(authorityData),
      canonicalNativeGoodsCodeCandidatesOf(authorityData),
      canonicalValidatedNativeGoodsRowCandidatesOf(authorityData),
      canonicalValidatedNativeGoodsOriginCandidatesOf(authorityData)
    ].map((envelope) => addProvenance(envelope, provenance, String(run._id)));

    const envelope: DeclarationFieldCandidateEnvelope = { ...sanitizedPersisted, fields: merge(sanitizedPersisted, ...deterministicBridges) };
    const selections = selectDirectSourceEvidenceAuthority(envelope as any);
    const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
    const selectedFields = new Set(selections.map((selection: any) => selection.field));

    const scalarMatrix = scalarFields.map((field) => {
      const persistedCandidates = before.fields[field] ?? [];
      const currentCandidates = envelope.fields[field] ?? [];
      const item: any = resolution.fields[field];
      const selectedAuthority = selectedFields.has(field);
      const roleAmbiguousCountry = ["originCountry", "exitCountry", "arrivalCountry", "destinationCountry", "tradeCountry"].includes(field);
      let classification = "SOURCE_ABSENT_FAIL_CLOSED";
      if (item?.status === "RESOLVED") classification = "CURRENT_AUTHORITY_RESOLVED";
      else if (roleAmbiguousCountry && currentCandidates.length > 0) classification = "ROLE_AMBIGUOUS_CANDIDATES_FAIL_CLOSED";
      else if (item?.status === "REVIEW_REQUIRED") classification = "SOURCE_PRESENT_REVIEW_REQUIRED";
      else if (currentCandidates.length > 0) classification = "SOURCE_PRESENT_UNRESOLVED";
      return {
        field,
        classification,
        selectedAuthority,
        currentStatus: item?.status ?? null,
        currentValue: resolvedValue(resolution, field) ?? null,
        persistedCandidateValues: [...new Set(persistedCandidates.map((candidate: any) => candidate.value))].slice(0, 8),
        currentCandidateValues: [...new Set(currentCandidates.map((candidate: any) => candidate.value))].slice(0, 8)
      };
    });

    const rowIndexes = [...new Set(Object.keys(generic.fields).map((field) => goodsField.exec(field)?.[1]).filter(Boolean).map(Number))].sort((a,b)=>a-b);
    const goodsRows = rowIndexes.map((row) => {
      const unresolved = goodsCore.filter((key) => resolution.fields[`goodsLines.${row}.${key}`]?.status !== "RESOLVED");
      return { row: row + 1, unresolved };
    });
    const originRowIndexes = [...new Set(Object.keys(origins.fields).map((field) => /^goodsLines\.(\d+)\.origin$/.exec(field)?.[1]).filter(Boolean).map(Number))].sort((a,b)=>a-b);
    const originResolutionRows = rowIndexes.map((row) => ({ row: row + 1, status: resolution.fields[`goodsLines.${row}.origin`]?.status ?? null, value: resolvedValue(resolution, `goodsLines.${row}.origin`) ?? null, selectedAuthority: selectedFields.has(`goodsLines.${row}.origin`) }));
    const unresolvedOriginRows = originResolutionRows.filter((row) => row.status !== "RESOLVED");
    const unselectedOriginRows = originResolutionRows.filter((row) => !row.selectedAuthority);

    const poisonedPayment = (before.fields.paymentType ?? []).filter((candidate) => sanitizeVisionPaymentType(candidate.value) === undefined).map((candidate) => candidate.value);
    const poisonedBank = (before.fields.bankInfo ?? []).filter((candidate) => sanitizeVisionBankInfo(candidate.value) === undefined).map((candidate) => candidate.value);
    const roleAmbiguous = scalarMatrix.filter((row) => row.classification === "ROLE_AMBIGUOUS_CANDIDATES_FAIL_CLOSED");
    const actionableScalarGaps = scalarMatrix.filter((row) => row.currentCandidateValues.length > 0 && (row.classification === "SOURCE_PRESENT_REVIEW_REQUIRED" || row.classification === "SOURCE_PRESENT_UNRESOLVED"));

    const acceptance = {
      paymentTypeCurrent: String(resolvedValue(resolution, "paymentType") ?? "").toUpperCase().includes("PESIN ODEME"),
      bankInfoAbsentCurrent: resolvedValue(resolution, "bankInfo") === undefined,
      freightZero: resolvedValue(resolution, "freight") === 0,
      insuranceZero: resolvedValue(resolution, "insurance") === 0,
      totalAmountResolved: resolvedValue(resolution, "totalAmount") === 31081.1,
      currencyResolved: resolvedValue(resolution, "currency") === "EUR",
      exchangeRateResolved: resolvedValue(resolution, "exchangeRate") === 53.3268,
      deliveryTermResolved: resolvedValue(resolution, "deliveryTerm") === "FCA",
      transportModeResolved: resolvedValue(resolution, "transportMode") === "Karayolu",
      packageResolved: resolvedValue(resolution, "totalPackage") === 2 && resolvedValue(resolution, "packageType") === "Bin",
      weightsResolved: resolvedValue(resolution, "grossWeight") === 554 && resolvedValue(resolution, "netWeight") === 530,
      goodsCore56x7Resolved: rowIndexes.length === 56 && goodsRows.every((row) => row.unresolved.length === 0),
      goodsOriginEvidencePresent: originRowIndexes.length === 56,
      goodsOrigin56Resolved: originResolutionRows.length === 56 && unresolvedOriginRows.length === 0,
      goodsOrigin56NativeAuthoritySelected: originResolutionRows.length === 56 && unselectedOriginRows.length === 0,
      staleBankPoisonNotActionable: !actionableScalarGaps.some((row) => row.field === "bankInfo"),
      ambiguousCustomsCountriesNotInvented: roleAmbiguous.every((row) => row.currentStatus !== "RESOLVED")
    };

    assert(Object.values(acceptance).every(Boolean), `1.8.35 row-origin authority replay failed: ${JSON.stringify(acceptance)}`);

    console.log(JSON.stringify({
      event: "product-e2e-1.8.35.persisted-row-origin-authority-replay.passed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      acceptance,
      currentResolvedCommercial: Object.fromEntries(["paymentType","freight","insurance","bankInfo","totalAmount","currency","exchangeRate","deliveryTerm","transportMode","totalPackage","packageType","grossWeight","netWeight"].map((field) => [field, resolvedValue(resolution, field) ?? null])),
      rejectedPersistedVisionPoison: { paymentType: poisonedPayment, bankInfo: poisonedBank },
      customsCountryRoleAmbiguity: roleAmbiguous,
      actionableScalarGaps,
      goodsCoverage: {
        deterministicGoodsRowCount: rowIndexes.length,
        coreFieldsPerRow: goodsCore.length,
        resolvedCoreFieldCount: goodsRows.reduce((sum, row) => sum + goodsCore.length - row.unresolved.length, 0),
        fullyResolvedRowCount: goodsRows.filter((row) => row.unresolved.length === 0).length,
        unresolvedRows: goodsRows.filter((row) => row.unresolved.length > 0),
        originEvidenceRowCount: originRowIndexes.length,
        originEvidenceMissingRows: rowIndexes.filter((row) => !originRowIndexes.includes(row)).map((row) => row + 1),
        resolvedOriginRowCount: originResolutionRows.filter((row) => row.status === "RESOLVED").length,
        nativeAuthorityOriginRowCount: originResolutionRows.filter((row) => row.selectedAuthority).length,
        unresolvedOriginRows,
        unselectedOriginRows,
        resolvedOriginSample: originResolutionRows.slice(0, 8)
      },
      scalarMatrix,
      declarationOwnershipNotes: {
        documentOwned: "The supplied declaration-field specification marks party/country, delivery/vehicle/container, invoice/value/payment/bank, package/weight and goods fields as Dokumandan Parse.",
        nonDocumentOwned: "User, Settings, Evrim and Calculated fields are excluded from IDP-miss classification.",
        roleRule: "A raw country token is not proof of a customs role. Line-level origin, buyer address country and seller address country must not be silently reused as exit/arrival/destination/trade country."
      },
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        currentGeneralDeterministicParsersOnly: true,
        currentVisionSanitizersAppliedInMemory: true,
        persistedReplayOnly: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        supplierSpecificRules: false,
        invoiceSpecificConstantsInProduction: false,
        directNormalizedWrite: false
      }
    }, null, 2));
  } finally { await mongoose.disconnect(); }
}

main().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
