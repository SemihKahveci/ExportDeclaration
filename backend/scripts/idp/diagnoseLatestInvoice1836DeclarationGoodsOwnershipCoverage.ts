import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceOriginFieldCandidates } from "../../src/modules/idp/candidates/invoiceOriginCandidateDiscovery.js";
import { validateGenericInvoiceEvidence } from "../../src/modules/idp/validator/genericInvoiceEvidenceValidator.js";

const expectedDocumentOwnedGoods = [
  "hsCode", "description", "quantity", "unit", "regime", "origin",
  "grossWeight", "netWeight", "package", "packageUnit", "supplementaryMeasure"
] as const;
const currentCore = ["hsCode", "productCode", "description", "quantity", "unit", "unitPrice", "lineTotal"] as const;

function rowFieldCoverage(fields: Record<string, unknown[]>, suffix: string, rows: number) {
  const presentRows: number[] = [];
  for (let row = 0; row < rows; row++) if ((fields[`goodsLines.${row}.${suffix}`] ?? []).length) presentRows.push(row + 1);
  return { field: suffix, candidateRowCount: presentRows.length, missingRows: Array.from({length: rows}, (_, i) => i + 1).filter(r => !presentRows.includes(r)) };
}

function canonicalText(canonical: any): string {
  return (canonical.pages ?? []).map((p: any) => [p.text, ...(p.words ?? []).map((w: any) => w.text)].filter(Boolean).join(" ")).join("\n");
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const upload: any = await UploadedFileModel.findOne({ type: "INVOICE" }).sort({ createdAt: -1 }).lean();
    assert(upload, "No persisted INVOICE upload found.");
    const run: any = await ProcessingRunModel.findOne({ uploadedFileId: upload._id, status: "COMPLETED" }).sort({ createdAt: -1 }).lean();
    assert(run?.canonicalDocument?.pages?.length, "Latest completed run has no persisted canonicalDocument.");

    const canonical = run.canonicalDocument as CanonicalDocument;
    const generic = discoverGenericInvoiceFieldCandidates(canonical, "segment-001");
    const validation: any = validateGenericInvoiceEvidence(canonical, generic);
    const origins = discoverInvoiceOriginFieldCandidates(canonical, "segment-001", generic);
    const fields: Record<string, any[]> = { ...(generic.fields as any) };
    for (const [field, candidates] of Object.entries(origins.fields ?? {})) fields[field] = [...(fields[field] ?? []), ...(candidates as any[])];

    const hsRows = Object.keys(generic.fields).filter(k => /^goodsLines\.\d+\.hsCode$/.test(k));
    const rowCount = hsRows.length;
    assert(rowCount > 0, "No deterministic goods rows found.");

    const discoveredSuffixes = [...new Set(Object.keys(fields).map(k => /^goodsLines\.\d+\.(.+)$/.exec(k)?.[1]).filter(Boolean))].sort();
    const coverage = expectedDocumentOwnedGoods.map(field => rowFieldCoverage(fields, field, rowCount));
    const coreCoverage = currentCore.map(field => rowFieldCoverage(fields, field, rowCount));
    const text = canonicalText(canonical);
    const semanticDocumentHits = {
      regime: /\b(rejim|regime)\b/i.test(text),
      grossWeight: /(br[uü]t|gross)\s*(kilo|kg|weight|a[gğ][iı]rl[iı]k)?/i.test(text),
      netWeight: /\bnet\s*(kilo|kg|weight|a[gğ][iı]rl[iı]k)?/i.test(text),
      package: /\b(kap|package|packages|colli)\b/i.test(text),
      supplementaryMeasure: /(tamamlay[iı]c[iı]\s*[oö]l[cç][uü]|supplementary\s*(unit|measure))/i.test(text)
    };

    const unsupportedByCurrentGoodsCandidateSchema = expectedDocumentOwnedGoods.filter(field => !discoveredSuffixes.includes(field));
    const sourcePresenceNeedsDedicatedSemanticParser = unsupportedByCurrentGoodsCandidateSchema.filter(field => {
      if (field === "regime") return semanticDocumentHits.regime;
      if (field === "grossWeight") return semanticDocumentHits.grossWeight;
      if (field === "netWeight") return semanticDocumentHits.netWeight;
      if (field === "package" || field === "packageUnit") return semanticDocumentHits.package;
      if (field === "supplementaryMeasure") return semanticDocumentHits.supplementaryMeasure;
      return false;
    });

    const result = {
      event: "product-e2e-1.8.36.declaration-goods-ownership-coverage.diagnosed",
      upload: { fileName: upload.originalName ?? upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      rowCount,
      currentGenericValidation: {
        validRowCount: Array.isArray(validation?.rows) ? validation.rows.filter((r: any) => r.status === "VALID").length : undefined,
        validationAvailable: Boolean(validation)
      },
      declarationSpecification: {
        documentOwnedGoodsFields: expectedDocumentOwnedGoods,
        note: "Ownership list mirrors the supplied Beyanname Alanlari specification; this diagnostic does not invent values for absent invoice evidence."
      },
      discoveredGoodsCandidateSuffixes: discoveredSuffixes,
      currentCoreCoverage: coreCoverage,
      declarationOwnedCoverage: coverage,
      semanticDocumentHits,
      unsupportedByCurrentGoodsCandidateSchema,
      sourcePresenceNeedsDedicatedSemanticParser,
      interpretation: {
        schemaUnsupported: "No current row candidate field exists; do not confuse this with a parser miss until source presence is proven.",
        semanticHit: "Canonical document contains a matching semantic label somewhere; a row-local parser/authority diagnostic is required before production promotion.",
        sourceAbsent: "A declaration-owned field may legitimately remain empty for this invoice when the source document does not contain it."
      },
      guardrails: {
        diagnosticOnly: true,
        persistedCanonicalEvidenceOnly: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        supplierSpecificRules: false,
        invoiceSpecificConstants: false,
        directNormalizedWrite: false
      }
    };
    console.log(JSON.stringify(result, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
