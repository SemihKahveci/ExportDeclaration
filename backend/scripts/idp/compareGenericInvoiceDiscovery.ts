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
  productCode?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
};

type GenericRow = Row & { rowIndex: number; source?: string; productCodeCandidates?: string[] };

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
    const match = /^goodsLines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal)$/.exec(field);
    if (!match || !candidates?.length) continue;
    const rowIndex = Number(match[1]);
    const name = match[2] as keyof Row;
    const candidate = candidates[0];
    const row = byIndex.get(rowIndex) ?? { rowIndex };
    if (name === "hsCode" || name === "description" || name === "unit") row[name] = stringValue(candidate.value) as never;
    else if (name === "productCode") {
      row.productCode = stringValue(candidate.value);
      row.productCodeCandidates = candidates.map((item: any) => stringValue(item?.value)).filter(Boolean) as string[];
    } else row[name] = numberValue(candidate.value) as never;
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
    productCode: stringValue(row?.productCode),
    description: stringValue(row?.description),
    quantity: numberValue(row?.quantity),
    unit: stringValue(row?.unit),
    unitPrice: numberValue(row?.unitPrice),
    lineTotal: numberValue(row?.lineTotal)
  }));
}

function normText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normUnit(value: string | undefined): string | undefined {
  const v = normText(value)?.replace(/\s/g, "");
  if (!v) return undefined;
  if (["ADET", "ADE", "PCS", "PC", "EA"].includes(v)) return "COUNT";
  if (["KG", "KGS"].includes(v)) return "KG";
  if (["MT", "M"].includes(v)) return "MT";
  return v;
}

function descriptionTokenRecall(expected: string | undefined, actual: string | undefined): number | undefined {
  const e = normText(expected)?.split(" ").filter(t => t.length > 1) ?? [];
  const a = new Set(normText(actual)?.split(" ").filter(t => t.length > 1) ?? []);
  if (!e.length) return undefined;
  return e.filter(t => a.has(t)).length / e.length;
}

function compare(baseline: Row[], generic: GenericRow[]) {
  const used = new Set<number>();
  let hsMatched = 0;
  let quantityComparable = 0, quantityMatched = 0;
  let priceComparable = 0, priceMatched = 0;
  let totalComparable = 0, totalMatched = 0;
  let productComparable = 0, productMatched = 0;
  let unitComparable = 0, unitMatched = 0;
  let descriptionComparable = 0, descriptionExact = 0, descriptionRecallSum = 0;

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
    if (base.productCode && found.row.productCodeCandidates?.length) {
      productComparable += 1;
      const expected = normText(base.productCode)?.replace(/\s/g, "");
      if (found.row.productCodeCandidates.some(value => normText(value)?.replace(/\s/g, "") === expected)) productMatched += 1;
    }
    if (base.unit && found.row.unit) {
      unitComparable += 1;
      if (normUnit(base.unit) === normUnit(found.row.unit)) unitMatched += 1;
    }
    if (base.description && found.row.description) {
      descriptionComparable += 1;
      if (normText(base.description) === normText(found.row.description)) descriptionExact += 1;
      descriptionRecallSum += descriptionTokenRecall(base.description, found.row.description) ?? 0;
    }
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
    productCode: {
      legacyAgreementMatched: productMatched,
      legacyComparable: productComparable,
      legacyAgreementPct: pct(productMatched, productComparable),
      note: "Agreement with resolvedResult legacy extraction; not ground-truth accuracy."
    },
    description: {
      legacyExactMatched: descriptionExact,
      legacyComparable: descriptionComparable,
      legacyExactPct: pct(descriptionExact, descriptionComparable),
      legacyAvgTokenRecallPct: descriptionComparable ? Number((descriptionRecallSum * 100 / descriptionComparable).toFixed(2)) : null,
      note: "Similarity to resolvedResult legacy extraction; not ground-truth accuracy."
    },
    quantity: { matched: quantityMatched, comparable: quantityComparable, exactPct: pct(quantityMatched, quantityComparable) },
    unit: { matched: unitMatched, comparable: unitComparable, exactPct: pct(unitMatched, unitComparable) },
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
    console.log(JSON.stringify({ event: "idp.generic-invoice-discovery.real-comparison", reference: "LEGACY_RESOLVED_RESULT_NOT_GROUND_TRUTH", results }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
