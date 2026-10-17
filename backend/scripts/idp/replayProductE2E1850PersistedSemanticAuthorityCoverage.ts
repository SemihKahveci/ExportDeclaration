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
  canonicalValidatedNativeGoodsOriginCandidatesOf,
  canonicalValidatedNativeGoodsRowCandidatesOf,
  enforceValidatedNativeGoodsFieldAuthority,
  enforceVisionDocumentRoleAuthority,
  enforceVisionGoodsRowBoundary,
  enforceVisionSourceBackedCommercialNumericAuthority,
  sanitizeVisionCommercialSemanticCandidates,
} from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import { DEFAULT_DECLARATION_FIELD_TARGETS } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";
import { PRODUCT_E2E_GENERALIZATION_CASES } from "./productE2EGeneralizationGroundTruth.js";
import { PRODUCT_E2E_CORPUS_CASES } from "./productE2ECorpusGroundTruth.js";

const TARGET_FILES = [
  "VED2026000000146.pdf",
  PRODUCT_E2E_CORPUS_CASES.find((entry) => entry.id === "clk-celikel")!.pdf,
  ...PRODUCT_E2E_GENERALIZATION_CASES
    .filter((entry) => ["volta-vxa-0035", "eryem-yem-0037", "pml-p0087", "dermeternal-2026-0001", "ningbo-wyl-2026060501"].includes(entry.id))
    .map((entry) => entry.pdf),
];

const scalarFields = [
  "invoiceNo", "invoiceDate", "parties.seller.name", "parties.seller.address", "parties.seller.country",
  "parties.buyer.name", "parties.buyer.address", "parties.buyer.country", "totalAmount", "currency",
  "deliveryTerm", "paymentType", "transportMode", "exchangeRate", "freight", "insurance", "bankInfo",
  "totalPackage", "packageType", "grossWeight", "netWeight",
] as const;
const goodsCore = ["hsCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const;

function addProvenance(envelope: any, provenance: any, runId: string): DeclarationFieldCandidateEnvelope {
  return { version: "1", fields: Object.fromEntries(Object.entries(envelope.fields ?? {}).map(([field, candidates]: any) => [
    field,
    candidates.map((candidate: any) => ({ ...candidate, logicalDocumentId: provenance.logicalDocumentId, uploadedFileId: provenance.uploadedFileId,
      documentType: provenance.documentType ?? "INVOICE", sourceProcessingRunId: provenance.sourceProcessingRunId ?? runId }))
  ])) } as DeclarationFieldCandidateEnvelope;
}
function merge(...envelopes: DeclarationFieldCandidateEnvelope[]): DeclarationFieldCandidateEnvelope {
  const fields: Record<string, DeclarationFieldCandidate[]> = {};
  for (const envelope of envelopes) for (const [field, candidates] of Object.entries(envelope.fields ?? {})) {
    const target = fields[field] ??= [];
    const ids = new Set(target.map((candidate) => candidate.candidateId));
    for (const candidate of candidates) if (!ids.has(candidate.candidateId)) { target.push(candidate); ids.add(candidate.candidateId); }
  }
  return { version: "1", fields };
}
function resolvedValue(resolution: any, field: string): unknown {
  const item = resolution?.fields?.[field];
  return item?.status === "RESOLVED" ? item.value : undefined;
}
function promotionMapped(field: string): boolean {
  return Boolean(DEFAULT_DECLARATION_FIELD_TARGETS[field]) || /^goodsLines\.\d+\.(?:hsCode|productCode|description|quantity|unit|unitPrice|lineTotal|origin|grossKg|netKg)$/.test(field);
}

async function replay(fileName: string) {
  const upload: any = await UploadedFileModel.findOne({ fileName }).sort({ createdAt: -1 }).lean();
  if (!upload) return { fileName, classification: "REPLAY_SOURCE_MISSING" };
  const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
  if (!run?.canonicalDocument?.pages?.length || !run?.declarationCandidates?.fields) {
    return { fileName, classification: "REPLAY_SOURCE_STALE", uploadId: String(upload._id), reason: "completed canonicalDocument/declarationCandidates unavailable" };
  }

  const canonical = run.canonicalDocument as CanonicalDocument;
  const persisted = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
  const provenance: any = Object.values(persisted.fields).flat()[0];
  if (!provenance) return { fileName, classification: "REPLAY_SOURCE_STALE", uploadId: String(upload._id), runId: String(run._id), reason: "candidate provenance unavailable" };
  const segmentId = provenance.evidence?.[0]?.segmentId ?? "segment-001";

  const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
  const validation = validateGenericInvoiceEvidence(canonical, generic);
  const headerParty = discoverInvoiceHeaderPartyFieldCandidates(canonical, segmentId);
  const shipment = discoverInvoiceShipmentFieldCandidates(canonical, segmentId);
  const commercial = discoverInvoiceCommercialTermsFieldCandidates(canonical, segmentId);
  const origins = discoverInvoiceOriginFieldCandidates(canonical, segmentId, generic);
  const audit: any = { genericCandidateAudit: { candidates: generic, validation, headerPartyCandidates: headerParty, shipmentCandidates: shipment, commercialTermsCandidates: commercial, originCandidates: origins } };
  const deterministic = [
    canonicalHeaderPartyCandidatesOf(audit), canonicalNativeShipmentCandidatesOf(audit), canonicalCommercialTermsCandidatesOf(audit),
    canonicalNativeGoodsCodeCandidatesOf(audit), canonicalValidatedNativeGoodsRowCandidatesOf(audit), canonicalValidatedNativeGoodsOriginCandidatesOf(audit),
  ].map((value) => addProvenance(value, provenance, String(run._id)));
  const deterministicMerged = merge(...deterministic);

  // Replay the current production persistence boundaries in memory. No OCR/model call and no DB mutation.
  let guarded = sanitizeVisionCommercialSemanticCandidates(persisted as any) as any;
  guarded = enforceVisionDocumentRoleAuthority(guarded, canonical) as any;
  guarded = enforceVisionSourceBackedCommercialNumericAuthority(guarded, deterministicMerged as any) as any;
  guarded = enforceValidatedNativeGoodsFieldAuthority(guarded, deterministicMerged as any) as any;
  guarded = enforceVisionGoodsRowBoundary(guarded, deterministicMerged as any) as any;

  // 1.8.50.3: this is a *current-parser* replay. Persisted candidates may carry
  // deterministic candidateIds produced by an older parser version. The current
  // deterministic rebuild intentionally reuses stable IDs, so merging persisted
  // data first can silently keep the stale value and discard the newly rebuilt
  // candidate as a duplicate. Put the current deterministic envelope first:
  // current parser truth wins only on identical candidateId; all unrelated
  // persisted/Vision evidence remains available for conflict resolution.
  const current = merge(deterministicMerged, guarded as any);
  const selections = selectDirectSourceEvidenceAuthority(current as any);
  const resolution: any = resolveDeclarationFields({ candidates: current as any, candidateSelections: selections });
  const selected = new Set(selections.map((entry: any) => entry.field));

  const scalarMatrix = scalarFields.map((field) => {
    const candidates = current.fields[field] ?? [];
    const item = resolution.fields[field];
    const value = resolvedValue(resolution, field);
    return { field, candidateCount: candidates.length, selectedAuthority: selected.has(field), status: item?.status ?? "ABSENT", value: value ?? null,
      promotionMapped: promotionMapped(field), promotionEligible: item?.status === "RESOLVED" && Boolean(item?.selectedCandidate) && promotionMapped(field) };
  });
  const rows = [...new Set(Object.keys(current.fields).flatMap((field) => { const match = /^goodsLines\.(\d+)\./.exec(field); return match ? [Number(match[1])] : []; }))].sort((a,b)=>a-b);
  const goods = rows.map((row) => ({ row: row + 1, resolved: goodsCore.filter((key) => resolution.fields[`goodsLines.${row}.${key}`]?.status === "RESOLVED").length,
    unresolved: goodsCore.filter((key) => resolution.fields[`goodsLines.${row}.${key}`]?.status !== "RESOLVED"),
    promotionEligible: goodsCore.filter((key) => resolution.fields[`goodsLines.${row}.${key}`]?.status === "RESOLVED" && resolution.fields[`goodsLines.${row}.${key}`]?.selectedCandidate).length }));

  return { fileName, classification: "CURRENT_SEMANTIC_REPLAY_AVAILABLE", uploadId: String(upload._id), runId: String(run._id), runCreatedAt: run.createdAt,
    deterministicEvidence: { headerPartyFields: Object.keys(headerParty.fields), shipmentFields: Object.keys(shipment.fields), commercialFields: Object.keys(commercial.fields), goodsFieldCount: Object.keys(generic.fields).filter((f)=>f.startsWith("goodsLines.")).length },
    scalarMatrix, goodsCoverage: { rowCount: rows.length, fullyResolvedRows: goods.filter((row)=>row.unresolved.length===0).length, fullyPromotionEligibleRows: goods.filter((row)=>row.promotionEligible===goodsCore.length).length, unresolvedRows: goods.filter((row)=>row.unresolved.length>0).slice(0,20) } };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const documents = [];
    for (const fileName of TARGET_FILES) documents.push(await replay(fileName));
    const available = documents.filter((entry: any) => entry.classification === "CURRENT_SEMANTIC_REPLAY_AVAILABLE");
    const missingOrStale = documents.filter((entry: any) => entry.classification !== "CURRENT_SEMANTIC_REPLAY_AVAILABLE");
    console.log(JSON.stringify({ event: "product-e2e-1.8.50.persisted-semantic-authority-coverage.replayed", targetDocumentCount: TARGET_FILES.length,
      availableReplayCount: available.length, freshRunRequired: missingOrStale.map((entry: any) => ({ fileName: entry.fileName, reason: entry.classification })), documents,
      guardrails: { persistedCanonicalEvidenceOnly: true, currentGeneralDeterministicParsersOnly: true, currentProductionCandidateGuardsReplayedInMemory: true,
        ocrOrModelInference: false, databaseMutation: false, supplierSpecificRules: false, invoiceSpecificConstantsInProduction: false, directNormalizedWrite: false } }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
