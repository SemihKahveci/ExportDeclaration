import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";

const ROW_RE = /^goodsLines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal)$/;
const CORE = ["hsCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const;

function evidencePages(candidate: any): number[] {
  return [...new Set((candidate?.evidence ?? []).map((e: any) => Number(e.pageNumber)).filter(Number.isFinite))].sort((a, b) => a - b);
}
function exact12(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{12}$/.test(digits) ? digits : undefined;
}
function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function compact(candidate: any) {
  if (!candidate) return null;
  return { value: candidate.value, candidateId: candidate.candidateId, extractor: candidate.extractor, pages: evidencePages(candidate), evidence: (candidate.evidence ?? []).map((e: any) => ({ pageNumber: e.pageNumber, contentSource: e.contentSource, text: e.text })) };
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
    const provenance: any = Object.values(run.declarationCandidates.fields).flat()[0];
    const segmentId = provenance?.evidence?.[0]?.segmentId ?? "segment-001";
    const generic = discoverGenericInvoiceFieldCandidates(canonical, segmentId);
    const validation = validateGenericInvoiceEvidence(canonical, generic);
    const validationByRow = new Map(validation.rows.map((row) => [row.rowIndex, row]));
    const indexes = [...new Set(Object.keys(generic.fields).map((field) => ROW_RE.exec(field)).filter(Boolean).map((m) => Number(m![1])))].sort((a, b) => a - b);

    const rows = indexes.map((index) => {
      const candidates: Record<string, any> = {};
      for (const name of ["hsCode", "productCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const) {
        candidates[name] = generic.fields[`goodsLines.${index}.${name}`]?.[0];
      }
      const hsPage = evidencePages(candidates.hsCode)[0];
      const pageMismatchFields = CORE.filter((name) => candidates[name] && !evidencePages(candidates[name]).includes(hsPage));
      const missingCoreFields = CORE.filter((name) => !candidates[name]);
      const q = numeric(candidates.quantity?.value);
      const p = numeric(candidates.unitPrice?.value);
      const amount = numeric(candidates.lineTotal?.value);
      const tolerance = amount === undefined ? undefined : Math.max(0.05, Math.abs(amount) * 0.001);
      const arithmeticDelta = q !== undefined && p !== undefined && amount !== undefined ? Math.abs(q * p - amount) : undefined;
      const arithmeticOk = arithmeticDelta !== undefined && tolerance !== undefined ? arithmeticDelta <= tolerance : false;
      const validationRow = validationByRow.get(index);
      const evidenceIssues = (validationRow?.issues ?? []).filter((issue: any) => ["MISSING_EVIDENCE", "INVALID_EVIDENCE_PAGE", "INVALID_EVIDENCE_BBOX", "EVIDENCE_NOT_SUPPORTED_BY_CANONICAL"].includes(issue.code));
      return {
        row: index + 1,
        anchorPage: hsPage ?? null,
        exact12Hs: exact12(candidates.hsCode?.value) ?? null,
        missingCoreFields,
        pageMismatchFields,
        arithmetic: { quantity: q ?? null, unitPrice: p ?? null, lineTotal: amount ?? null, delta: arithmeticDelta ?? null, tolerance: tolerance ?? null, ok: arithmeticOk },
        validationStatus: validationRow?.status ?? null,
        validationIssues: (validationRow?.issues ?? []).map((issue: any) => ({ field: issue.field, code: issue.code })),
        evidenceIssueCount: evidenceIssues.length,
        fields: Object.fromEntries(Object.entries(candidates).map(([name, candidate]) => [name, compact(candidate)]))
      };
    });

    const exact12Count = rows.filter((row) => row.exact12Hs).length;
    const samePageCoreCount = rows.filter((row) => row.pageMismatchFields.length === 0).length;
    const completeCoreCount = rows.filter((row) => row.missingCoreFields.length === 0).length;
    const arithmeticOkCount = rows.filter((row) => row.arithmetic.ok).length;
    const evidenceCleanCount = rows.filter((row) => row.evidenceIssueCount === 0).length;
    const suspiciousRows = rows.filter((row) => !row.exact12Hs || row.missingCoreFields.length || row.pageMismatchFields.length || !row.arithmetic.ok || row.evidenceIssueCount);

    console.log(JSON.stringify({
      event: "product-e2e-1.8.20.persisted-goods-row-integrity-replay.completed",
      upload: { fileName: upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      summary: {
        rowCount: rows.length,
        exact12HsCount: exact12Count,
        completeCoreCount,
        samePageCoreCount,
        arithmeticOkCount,
        evidenceCleanCount,
        validationStatus: validation.status,
        suspiciousRowCount: suspiciousRows.length
      },
      suspiciousRows,
      rows,
      guardrails: {
        persistedCanonicalEvidenceOnly: true,
        deterministicGeometryReplayOnly: true,
        comparesFieldsWithinSameLogicalRow: true,
        checksPageBoundaryAlignment: true,
        checksArithmeticIdentity: true,
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
