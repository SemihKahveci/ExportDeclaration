import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";

const HS_RE = /^goodsLines\.(\d+)\.hsCode$/;

function exact12(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{12}$/.test(digits) ? digits : undefined;
}

function compact(candidate: any) {
  return candidate ? {
    value: candidate.value,
    candidateId: candidate.candidateId,
    extractor: candidate.extractor,
    evidence: (candidate.evidence ?? []).map((e: any) => ({ pageNumber: e.pageNumber, contentSource: e.contentSource, text: e.text }))
  } : undefined;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run?.canonicalDocument?.pages?.length, "Latest completed run has no persisted canonicalDocument.");
    assert(run?.declarationCandidates?.fields, "Latest completed run has no persisted declarationCandidates.");

    const before = run.declarationCandidates as DeclarationFieldCandidateEnvelope;
    const canonical = run.canonicalDocument as CanonicalDocument;
    const provenance: any = Object.values(before.fields).flat()[0];
    assert(provenance, "Persisted declaration candidates have no provenance template.");
    const segmentId = provenance.evidence?.[0]?.segmentId ?? "segment-001";

    // Re-run only the deterministic geometry parser against persisted canonical
    // words. No OCR/model call and no database write occurs here.
    const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
    const validation = validateGenericInvoiceEvidence(canonical, generic);
    const rowValidation = new Map(validation.rows.map((row) => [row.rowIndex, row]));

    const existingHsFields = Object.keys(before.fields).filter((field) => HS_RE.test(field)).sort();
    const genericHsFields = Object.keys(generic.fields).filter((field) => HS_RE.test(field)).sort();
    const allIndexes = [...new Set([...existingHsFields, ...genericHsFields].map((field) => Number(HS_RE.exec(field)![1])))].sort((a, b) => a - b);

    const fields: any = Object.fromEntries(Object.entries(before.fields).map(([field, candidates]) => [field, [...candidates]]));
    const injected: string[] = [];
    const diagnostics: any[] = [];

    for (const index of allIndexes) {
      const field = `goodsLines.${index}.hsCode`;
      const current = fields[field] ?? [];
      const genericCandidate: any = generic.fields[field]?.[0];
      const code = exact12(genericCandidate?.value);
      const native = Boolean(genericCandidate?.evidence?.some((e: any) => e.contentSource === "NATIVE_TEXT"));
      const row = rowValidation.get(index);
      const evidenceIssue = row?.issues?.some((issue: any) => issue.field === field && [
        "MISSING_EVIDENCE", "INVALID_EVIDENCE_PAGE", "INVALID_EVIDENCE_BBOX", "EVIDENCE_NOT_SUPPORTED_BY_CANONICAL"
      ].includes(issue.code));

      // Diagnostic simulation only. A generic GTIP is eligible when it is an
      // exact 12-digit native-text token whose own evidence passed canonical
      // validation. Other row issues (description/arithmetic/etc.) do not turn
      // an exact source GTIP into fabricated evidence.
      const eligible = Boolean(code && native && !evidenceIssue);
      if (eligible && genericCandidate) {
        const candidate = {
          ...genericCandidate,
          candidateId: `${genericCandidate.candidateId}:f6-native-hs`,
          field,
          logicalDocumentId: provenance.logicalDocumentId,
          uploadedFileId: provenance.uploadedFileId,
          documentType: provenance.documentType,
          sourceProcessingRunId: provenance.sourceProcessingRunId
        };
        const duplicate = current.some((item: any) => exact12(item.value) === code && item.evidence?.some((e: any) => e.contentSource === "NATIVE_TEXT"));
        if (!duplicate) {
          (fields[field] ??= []).push(candidate);
          injected.push(field);
        }
      }

      diagnostics.push({
        row: index + 1,
        field,
        persisted: current.map(compact),
        generic: compact(genericCandidate),
        exact12: code ?? null,
        nativeText: native,
        ownEvidenceValid: !evidenceIssue,
        rowValidationStatus: row?.status ?? null,
        rowIssues: row?.issues?.map((issue: any) => ({ field: issue.field, code: issue.code })) ?? [],
        simulatedEligible: eligible
      });
    }

    const replayCandidates = { ...before, fields } as DeclarationFieldCandidateEnvelope;
    const candidateSelections = selectDirectSourceEvidenceAuthority(replayCandidates as any);
    const resolution = resolveDeclarationFields({ candidates: replayCandidates, candidateSelections });

    const hsResolution = Object.fromEntries(Object.entries(resolution.fields)
      .filter(([field]) => HS_RE.test(field))
      .map(([field, item]: any) => [field, {
        status: item.status,
        method: item.method,
        value: item.value,
        reason: item.reason,
        candidateCount: item.candidates?.length ?? 0,
        selectedCandidateId: item.selectedCandidateId
      }]));
    const unresolved = Object.entries(hsResolution).filter(([, item]: any) => item.status !== "RESOLVED").map(([field]) => field);
    const resolvedExact12 = Object.entries(hsResolution).filter(([, item]: any) => item.status === "RESOLVED" && exact12(item.value)).map(([field]) => field);

    console.log(JSON.stringify({
      event: "product-e2e-1.8.18.persisted-goods-code-replay.completed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary: {
        persistedHsFieldCount: existingHsFields.length,
        genericHsFieldCount: genericHsFields.length,
        genericValidationStatus: validation.status,
        simulatedNativeHsInjected: injected.length,
        resolvedExact12Count: resolvedExact12.length,
        unresolvedHsCount: unresolved.length
      },
      injected,
      unresolved,
      diagnostics,
      hsResolution,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        deterministicGeometryReplayOnly: true,
        productionBehaviorChanged: false,
        rerunsOcr: false,
        rerunsLlm: false,
        mutatesDatabase: false
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
