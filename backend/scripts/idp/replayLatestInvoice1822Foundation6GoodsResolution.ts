import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";
import { canonicalNativeGoodsCodeCandidatesOf, canonicalValidatedNativeGoodsRowCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";

const CORE = ["hsCode", "productCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const;
const GOODS = /^goodsLines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal)$/;

function mergeFields(...envelopes: Array<{ fields?: Record<string, any[]> }>): Record<string, any[]> {
  const fields: Record<string, any[]> = {};
  for (const envelope of envelopes) for (const [field, candidates] of Object.entries(envelope.fields ?? {})) {
    const target = fields[field] ??= [];
    for (const candidate of candidates) if (!target.some((item) => item.candidateId === candidate.candidateId)) target.push(candidate);
  }
  return fields;
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

    // Rebuild only deterministic generic evidence from persisted canonical words.
    // This is intentionally model-free and read-only.
    const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
    const validation = validateGenericInvoiceEvidence(canonical, generic);
    const syntheticData: any = { genericCandidateAudit: { candidates: generic, validation } };
    const nativeHs = canonicalNativeGoodsCodeCandidatesOf(syntheticData);
    const nativeRows = canonicalValidatedNativeGoodsRowCandidatesOf(syntheticData);

    const addProvenance = (envelope: any) => ({ version: "1", fields: Object.fromEntries(Object.entries(envelope.fields ?? {}).map(([field, candidates]: any) => [field, candidates.map((candidate: any) => ({ ...candidate, logicalDocumentId: provenance.logicalDocumentId, uploadedFileId: provenance.uploadedFileId, documentType: provenance.documentType ?? "INVOICE", sourceProcessingRunId: provenance.sourceProcessingRunId ?? String(run._id) }))])) });
    const mergedFields = mergeFields(before, addProvenance(nativeHs), addProvenance(nativeRows));
    const envelope: any = { version: "1", companyId: before.companyId ?? String(upload.companyId), declarationId: before.declarationId ?? "persisted-replay", fields: mergedFields };
    const selections = selectDirectSourceEvidenceAuthority(envelope);
    const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });

    const rowIndexes = [...new Set(Object.keys(generic.fields).map((field) => GOODS.exec(field)?.[1]).filter(Boolean).map(Number))].sort((a,b)=>a-b);
    const rows = rowIndexes.map((row) => {
      const fields: any = {};
      for (const key of CORE) {
        const field = `goodsLines.${row}.${key}`;
        const resolved: any = resolution.fields[field];
        fields[key] = { status: resolved?.status ?? "MISSING", value: resolved?.value, selectedCandidateId: resolved?.selectedCandidateId, method: resolved?.method };
      }
      const unresolved = CORE.filter((key) => fields[key].status !== "RESOLVED");
      const nativeAuthority = CORE.filter((key) => String(fields[key].selectedCandidateId ?? "").includes(key === "hsCode" ? ":f6-native-hs" : ":f6-native-row"));
      return { row: row + 1, unresolved, nativeAuthorityCount: nativeAuthority.length, fields };
    });

    const unresolvedFields = rows.flatMap((row) => row.unresolved.map((key) => `goodsLines.${row.row - 1}.${key}`));
    const reviewGoods = resolution.reviewRequiredFields.filter((field) => GOODS.test(field));
    const summary = {
      rowCount: rows.length,
      expectedCoreFieldCount: rows.length * CORE.length,
      resolvedCoreFieldCount: rows.reduce((sum, row) => sum + CORE.length - row.unresolved.length, 0),
      fullyResolvedRowCount: rows.filter((row) => row.unresolved.length === 0).length,
      unresolvedCoreFieldCount: unresolvedFields.length,
      foundation6ReviewGoodsFieldCount: reviewGoods.length,
      nativeAuthoritySelectionCount: selections.filter((selection) => GOODS.test(selection.field)).length
    };

    console.log(JSON.stringify({
      event: "product-e2e-1.8.22.persisted-foundation6-goods-resolution-replay.completed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary,
      unresolvedFields,
      foundation6ReviewGoodsFields: reviewGoods,
      guardrails: { persistedCanonicalEvidenceOnly: true, ocrOrModelInference: false, databaseMutation: false, directNormalizedWrite: false },
      problematicRows: rows.filter((row) => row.unresolved.length > 0),
      rows
    }, null, 2));
  } finally { await mongoose.disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
