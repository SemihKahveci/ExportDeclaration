/**
 * Dump latest completed invoice runs focused on 8.25.6 gaps:
 * goods footers, quantity recovery shape, origin candidates.
 * Usage: npx tsx backend/scripts/idp/dumpFoundation8256CanaryGaps.ts --limit=4
 * Output: stdout JSON (redirect to file).
 */
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import {
  isAmountInWordsText,
  isNonCommercialGoodsLine
} from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((v) => v.startsWith(`${name}=`));
  const value = hit ? Number(hit.slice(name.length + 1)) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function goodsSummary(goods: unknown[]): unknown[] {
  return goods.map((raw, index) => {
    const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const description = typeof g.description === "string" ? g.description : "";
    return {
      index,
      quantity: g.quantity ?? null,
      unit: g.unit ?? null,
      unitPrice: g.unitPrice ?? null,
      lineTotal: g.lineTotal ?? null,
      origin: g.origin ?? null,
      hsCode: g.hsCode ?? null,
      productCode: g.productCode ?? null,
      descriptionPreview: description.slice(0, 120),
      amountInWords: description ? isAmountInWordsText(description) : false,
      wouldDropAsNonCommercial: isNonCommercialGoodsLine(g as never)
    };
  });
}

function parseNaturalGoods(raw: string | undefined): unknown[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as {
      goodsLines?: unknown;
    };
    return Array.isArray(parsed.goodsLines) ? parsed.goodsLines : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const limit = Math.min(arg("--limit", 4), 20);
  await mongoose.connect(env.mongoUri);
  try {
    const runs = await ProcessingRunModel.find({ status: "COMPLETED" })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    const report = [];
    for (const run of runs) {
      const [upload, declaration] = await Promise.all([
        UploadedFileModel.findById(run.uploadedFileId).lean(),
        DeclarationModel.findById(run.declarationId).lean()
      ]);
      const nd = ((declaration as { normalizedData?: Record<string, unknown> } | null)?.normalizedData
        ?? {}) as Record<string, unknown>;
      const goods = Array.isArray(nd.goodsLines) ? nd.goodsLines : [];
      const artifacts = Array.isArray(run.modelExtractionArtifacts)
        ? run.modelExtractionArtifacts
        : [];
      const pageArtifacts = artifacts.map((artifact: {
        documentId?: string;
        pageNumbers?: number[];
        rawModelResponse?: string;
        parsedSemanticResponse?: { fields?: Array<{ field: string; value: unknown }> };
      }) => {
        const naturalGoods = parseNaturalGoods(artifact.rawModelResponse);
        const fields = artifact.parsedSemanticResponse?.fields ?? [];
        const pick = (name: string) => fields.find((f) => f.field === name)?.value ?? null;
        return {
          documentId: artifact.documentId ?? null,
          pageNumbers: artifact.pageNumbers ?? null,
          naturalGoods: goodsSummary(naturalGoods as unknown[]),
          parsedSemantic: {
            quantity: pick("goodsLines[].quantity"),
            unit: pick("goodsLines[].unit"),
            unitPrice: pick("goodsLines[].unitPrice"),
            lineTotal: pick("goodsLines[].lineTotal"),
            origin: pick("goodsLines[].origin")
          }
        };
      });
      const first = goods[0] && typeof goods[0] === "object" ? goods[0] as Record<string, unknown> : {};
      report.push({
        fileName: upload?.fileName ?? null,
        runId: String(run._id),
        completedAt: run.completedAt,
        buyerCountry: (nd.parties as { buyer?: { country?: string } } | undefined)?.buyer?.country ?? null,
        goodsCount: goods.length,
        originNonNull: goods.filter((g) => g && typeof g === "object" && (g as { origin?: unknown }).origin).length,
        finalQty0: first.quantity ?? null,
        visionQty0: pageArtifacts[0]?.parsedSemantic?.quantity ?? null,
        goods: goodsSummary(goods),
        pageArtifacts
      });
    }
    process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), limit, count: report.length, runs: report }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
