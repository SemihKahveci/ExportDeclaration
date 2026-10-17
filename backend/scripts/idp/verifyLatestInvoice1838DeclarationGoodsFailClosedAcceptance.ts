import assert from "node:assert/strict";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalBBox, CanonicalDocument, CanonicalPage } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";

const targets = {
  regime: /\b(rejim|regime)\b/i,
  grossWeight: /(br[uü]t|gross)\s*(kilo|kg|weight|a[gğ][iı]rl[iı]k)?/i,
  netWeight: /\bnet\s*(kilo|kg|weight|a[gğ][iı]rl[iı]k)?/i,
  package: /\b(kap|package|packages|colli)\b/i,
  supplementaryMeasure: /(tamamlay[iı]c[iı]\s*[oö]l[cç][uü]|supplementary\s*(unit|measure))/i
} as const;

type Target = keyof typeof targets;
type Anchor = { pageNumber: number; text: string; bbox: CanonicalBBox; centerY: number; relation: "ROW_LOCAL" | "GOODS_HEADER_OR_NEARBY" | "OUTSIDE_GOODS_TABLE" };

function cy(box: CanonicalBBox) { return (box.y0 + box.y1) / 2; }
function short(text: string) { return text.replace(/\s+/g, " ").trim().slice(0, 180); }

function hsAnchors(generic: any) {
  const byPage = new Map<number, number[]>();
  for (const [field, candidates] of Object.entries(generic.fields ?? {}) as [string, any[]][]) {
    if (!/^goodsLines\.\d+\.hsCode$/.test(field)) continue;
    for (const candidate of candidates) {
      for (const ev of candidate.evidence ?? []) {
        if (!ev.bbox) continue;
        const ys = byPage.get(ev.pageNumber) ?? [];
        ys.push(cy(ev.bbox));
        byPage.set(ev.pageNumber, ys);
      }
    }
  }
  for (const [page, ys] of byPage) byPage.set(page, [...new Set(ys.map(y => Number(y.toFixed(6))))].sort((a,b) => a-b));
  return byPage;
}

function relationFor(pageNumber: number, y: number, anchors: Map<number, number[]>): Anchor["relation"] {
  const ys = anchors.get(pageNumber) ?? [];
  if (!ys.length) return "OUTSIDE_GOODS_TABLE";
  const first = ys[0]!;
  const last = ys[ys.length - 1]!;
  const spacings = ys.slice(1).map((v, i) => v - ys[i]!).filter(v => v > 0);
  const typical = spacings.length ? spacings.sort((a,b)=>a-b)[Math.floor(spacings.length / 2)]! : 0.025;
  const rowTolerance = Math.max(0.006, Math.min(0.025, typical * 0.42));
  if (ys.some(anchorY => Math.abs(anchorY - y) <= rowTolerance)) return "ROW_LOCAL";
  if (y >= first - Math.max(0.02, typical * 1.5) && y <= last + Math.max(0.02, typical * 1.5)) return "GOODS_HEADER_OR_NEARBY";
  return "OUTSIDE_GOODS_TABLE";
}

function semanticAnchors(canonical: CanonicalDocument, anchors: Map<number, number[]>) {
  const result: Record<Target, Anchor[]> = { regime: [], grossWeight: [], netWeight: [], package: [], supplementaryMeasure: [] };
  for (const page of canonical.pages as CanonicalPage[]) {
    const sources = page.lines?.length ? page.lines : page.words.map(w => ({ text: w.text, bbox: w.bbox }));
    for (const source of sources) {
      for (const [field, re] of Object.entries(targets) as [Target, RegExp][]) {
        if (!re.test(source.text)) continue;
        const y = cy(source.bbox);
        result[field].push({ pageNumber: page.pageNumber, text: short(source.text), bbox: source.bbox, centerY: Number(y.toFixed(6)), relation: relationFor(page.pageNumber, y, anchors) });
      }
    }
  }
  return result;
}

function assessment(items: Anchor[]) {
  const rowLocal = items.filter(x => x.relation === "ROW_LOCAL");
  const nearby = items.filter(x => x.relation === "GOODS_HEADER_OR_NEARBY");
  return {
    classification: !items.length ? "SOURCE_ABSENT" : rowLocal.length ? "ROW_LOCAL_SEMANTIC_ANCHOR_PRESENT" : "SUMMARY_OR_HEADER_ONLY",
    semanticAnchorCount: items.length,
    rowLocalAnchorCount: rowLocal.length,
    goodsHeaderOrNearbyCount: nearby.length,
    outsideGoodsTableCount: items.length - rowLocal.length - nearby.length,
    requiresProductionRowParser: rowLocal.length > 0
  };
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
    const anchors = hsAnchors(generic);
    const semantics = semanticAnchors(canonical, anchors);
    const rowCount = Object.keys(generic.fields).filter(k => /^goodsLines\.\d+\.hsCode$/.test(k)).length;
    assert(rowCount > 0, "No deterministic goods rows found.");

    const rowLocalSourceAssessment = Object.fromEntries((Object.keys(targets) as Target[]).map(field => [field, assessment(semantics[field])]));
    const fieldsNeedingProductionRowParser = (Object.entries(rowLocalSourceAssessment) as [Target, ReturnType<typeof assessment>][]) 
      .filter(([, value]) => value.requiresProductionRowParser).map(([field]) => field);
    const fieldsCorrectlyAbsentAtRowLevel = (Object.entries(rowLocalSourceAssessment) as [Target, ReturnType<typeof assessment>][]) 
      .filter(([, value]) => !value.requiresProductionRowParser).map(([field]) => field);

    const acceptance = {
      noUnsupportedRowParserNeeded: fieldsNeedingProductionRowParser.length === 0,
      regimeSourceAbsent: rowLocalSourceAssessment.regime.classification === "SOURCE_ABSENT",
      grossWeightSummaryOnly: rowLocalSourceAssessment.grossWeight.classification === "SUMMARY_OR_HEADER_ONLY",
      netWeightSummaryOnly: rowLocalSourceAssessment.netWeight.classification === "SUMMARY_OR_HEADER_ONLY",
      packageNotRowLocal: rowLocalSourceAssessment.package.classification !== "ROW_LOCAL_SEMANTIC_ANCHOR_PRESENT",
      supplementaryMeasureSourceAbsent: rowLocalSourceAssessment.supplementaryMeasure.classification === "SOURCE_ABSENT",
      packageUnitNotInferred: !rowLocalSourceAssessment.package.requiresProductionRowParser,
    };
    assert.ok(Object.values(acceptance).every(Boolean), `1.8.38 fail-closed acceptance failed: ${JSON.stringify(acceptance)}`);

    console.log(JSON.stringify({
      event: "product-e2e-1.8.38.declaration-goods-fail-closed-acceptance.passed",
      acceptance,
      upload: { fileName: upload.originalName ?? upload.fileName, id: String(upload._id) },
      run: { id: String(run._id), status: run.status },
      goodsRowCount: rowCount,
      goodsPages: [...anchors.entries()].map(([pageNumber, ys]) => ({ pageNumber, hsAnchorCount: ys.length, firstHsY: ys[0], lastHsY: ys.at(-1) })),
      rowLocalSourceAssessment,
      semanticAnchorLocations: semantics,
      fieldsNeedingProductionRowParser,
      fieldsCorrectlyAbsentAtRowLevel,
      packageUnitAssessment: {
        classification: rowLocalSourceAssessment.package.requiresProductionRowParser ? "DEPENDS_ON_ROW_LOCAL_PACKAGE_EVIDENCE" : "NO_ROW_LOCAL_PACKAGE_SOURCE",
        requiresProductionRowParser: rowLocalSourceAssessment.package.requiresProductionRowParser
      },
      interpretation: {
        rowLocal: "A semantic anchor overlaps a goods-row HS band. This proves row-local source context exists and justifies a dedicated generic parser before authority/promotion.",
        summaryOrHeaderOnly: "The label exists in the document but not on a goods row. Do not copy invoice-level gross/net/package values into every declaration item.",
        sourceAbsent: "No semantic source anchor exists in this invoice; the document-owned field may remain empty for this invoice.",
        noInference: "This diagnostic classifies geometry only. It does not derive, divide, distribute, or promote any value."
      },
      guardrails: {
        acceptanceOnly: true,
        persistedCanonicalEvidenceOnly: true,
        geometryBasedRowLocality: true,
        ocrOrModelInference: false,
        databaseMutation: false,
        supplierSpecificRules: false,
        invoiceSpecificConstants: false,
        directNormalizedWrite: false
      }
    }, null, 2));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
