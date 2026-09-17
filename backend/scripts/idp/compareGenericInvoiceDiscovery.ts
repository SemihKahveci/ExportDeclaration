import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../../src/modules/idp/domain/documentSegment.types.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { SegmentClassification } from "../../src/modules/idp/domain/segmentClassification.types.js";
import { projectInvoiceCanonicalDocument } from "../../src/modules/idp/projector/canonicalSegmentProjector.js";

type Row = {
  hsCode?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
};

type GenericRow = Row & { rowIndex: number; source?: string };

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function close(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) <= Math.max(0.0001, Math.abs(b) * 0.00001);
}

function genericRows(fields: Record<string, any[]>): GenericRow[] {
  const byIndex = new Map<number, GenericRow>();
  for (const [field, candidates] of Object.entries(fields)) {
    const match = /^goodsLines\.(\d+)\.(hsCode|quantity|unitPrice|lineTotal)$/.exec(field);
    if (!match || !candidates?.length) continue;
    const rowIndex = Number(match[1]);
    const name = match[2] as keyof Row;
    const candidate = candidates[0];
    const row = byIndex.get(rowIndex) ?? { rowIndex };
    if (name === "hsCode") row.hsCode = stringValue(candidate.value);
    else row[name] = numberValue(candidate.value) as never;
    row.source ??= candidate.evidence?.[0]?.contentSource;
    byIndex.set(rowIndex, row);
  }
  return [...byIndex.values()].sort((a, b) => a.rowIndex - b.rowIndex);
}

function baselineRows(run: any): Row[] {
  const rows = run?.resolvedResult?.data?.goodsLines;
  if (!Array.isArray(rows)) return [];
  return rows.map((row: any) => ({
    hsCode: stringValue(row?.hsCode),
    quantity: numberValue(row?.quantity),
    unitPrice: numberValue(row?.unitPrice),
    lineTotal: numberValue(row?.lineTotal)
  }));
}

function compare(baseline: Row[], generic: GenericRow[]) {
  const used = new Set<number>();
  let hsMatched = 0;
  let quantityComparable = 0, quantityMatched = 0;
  let priceComparable = 0, priceMatched = 0;
  let totalComparable = 0, totalMatched = 0;

  for (const base of baseline) {
    if (!base.hsCode) continue;
    // Preserve document order. The same GTIP can legitimately occur on many
    // different goods rows with different quantity/price/amount values. Matching
    // by "best numeric similarity" would hide row-association bugs; consume the
    // next unused occurrence of the same GTIP instead.
    const found = generic
      .map((row, index) => ({ row, index }))
      .find(({ row, index }) => !used.has(index) && row.hsCode === base.hsCode);
    if (!found) continue;
    used.add(found.index);
    hsMatched += 1;
    if (base.quantity !== undefined && found.row.quantity !== undefined) {
      quantityComparable += 1;
      if (close(found.row.quantity, base.quantity)) quantityMatched += 1;
    }
    if (base.unitPrice !== undefined && found.row.unitPrice !== undefined) {
      priceComparable += 1;
      if (close(found.row.unitPrice, base.unitPrice)) priceMatched += 1;
    }
    if (base.lineTotal !== undefined && found.row.lineTotal !== undefined) {
      totalComparable += 1;
      if (close(found.row.lineTotal, base.lineTotal)) totalMatched += 1;
    }
  }

  const pct = (n: number, d: number) => d ? Number((n * 100 / d).toFixed(2)) : null;
  return {
    baselineRowCount: baseline.length,
    genericRowCount: generic.length,
    hsCode: { matched: hsMatched, baseline: baseline.filter((r) => r.hsCode).length, coveragePct: pct(hsMatched, baseline.filter((r) => r.hsCode).length) },
    quantity: { matched: quantityMatched, comparable: quantityComparable, exactPct: pct(quantityMatched, quantityComparable) },
    unitPrice: { matched: priceMatched, comparable: priceComparable, exactPct: pct(priceMatched, priceComparable) },
    lineTotal: { matched: totalMatched, comparable: totalComparable, exactPct: pct(totalMatched, totalComparable) },
    unmatchedGenericRows: generic.length - used.size,
    evidenceSources: [...new Set(generic.map((r) => r.source).filter(Boolean))]
  };
}

async function inspect(processingRunId: string) {
  const run = await ProcessingRunModel.findById(processingRunId).lean();
  if (!run) throw new Error(`ProcessingRun bulunamadı: ${processingRunId}`);
  const canonical = run.canonicalDocument as CanonicalDocument | undefined;
  const segments = run.segments as DocumentSegment[] | undefined;
  const classifications = run.classifications as SegmentClassification[] | undefined;
  if (!canonical?.pages?.length || !segments?.length || !classifications?.length) {
    throw new Error(`${processingRunId}: canonical/segments/classifications eksik.`);
  }
  const invoiceCanonical = projectInvoiceCanonicalDocument(canonical, segments, classifications);
  if (!invoiceCanonical) throw new Error(`${processingRunId}: INVOICE canonical projection bulunamadı.`);
  const invoiceSegments = classifications.filter((c) => c.documentType === "INVOICE").map((c) => c.segmentId);
  if (invoiceSegments.length !== 1) throw new Error(`${processingRunId}: comparison için tam 1 INVOICE segment bekleniyor; actual=${invoiceSegments.length}`);

  const envelope = discoverGenericInvoiceFieldCandidates(invoiceCanonical, invoiceSegments[0]!);
  const generic = genericRows(envelope.fields as Record<string, any[]>);
  const baseline = baselineRows(run);
  if (!baseline.length) throw new Error(`${processingRunId}: resolvedResult.data.goodsLines bulunamadı.`);

  return {
    processingRunId,
    contentKind: invoiceCanonical.analysis.contentKind,
    pageCount: invoiceCanonical.pages.length,
    ...compare(baseline, generic)
  };
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error("Kullanım: npx tsx backend/scripts/idp/compareGenericInvoiceDiscovery.ts <processingRunId> [processingRunId...]");
  await mongoose.connect(env.mongoUri);
  try {
    const results = [];
    for (const id of ids) results.push(await inspect(id));
    console.log(JSON.stringify({ event: "idp.generic-invoice-discovery.real-comparison", results }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
