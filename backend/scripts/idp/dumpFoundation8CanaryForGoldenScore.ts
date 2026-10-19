/**
 * Dump latest COMPLETED runs shaped for foundation8 goldenCorpusScorer.
 * Usage: npx tsx backend/scripts/idp/dumpFoundation8CanaryForGoldenScore.ts --limit=7
 */
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((v) => v.startsWith(`${name}=`));
  const value = hit ? Number(hit.slice(name.length + 1)) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function main(): Promise<void> {
  const limit = Math.min(arg("--limit", 7), 20);
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
      const nd = asRecord((declaration as { normalizedData?: unknown } | null)?.normalizedData);
      const header = asRecord(nd.header);
      const trade = asRecord(nd.trade);
      const finance = asRecord(nd.finance);
      const transport = asRecord(nd.transport);
      const packageInfo = asRecord(nd.packageInfo);
      const parties = asRecord(nd.parties);
      const buyer = asRecord(parties.buyer);
      const seller = asRecord(parties.seller);
      const goods = Array.isArray(nd.goodsLines) ? nd.goodsLines : [];
      const invoiceDateRaw = header.invoiceDate ?? nd.invoiceDate ?? null;
      const invoiceDate = typeof invoiceDateRaw === "string"
        ? invoiceDateRaw.slice(0, 10)
        : invoiceDateRaw instanceof Date
          ? invoiceDateRaw.toISOString().slice(0, 10)
          : invoiceDateRaw;
      report.push({
        fileName: upload?.fileName ?? null,
        runId: String(run._id),
        completedAt: run.completedAt,
        scalars: {
          invoiceNumber: header.invoiceNo ?? header.invoiceNumber ?? nd.invoiceNo ?? null,
          invoiceDate,
          currency: header.currency ?? nd.currency ?? null,
          totalAmount: header.totalAmount ?? nd.totalAmount ?? null,
          exchangeRate: finance.exchangeRate ?? nd.exchangeRate ?? null,
          deliveryTerm: trade.deliveryTerm ?? nd.deliveryTerm ?? null,
          paymentType: trade.paymentType ?? nd.paymentType ?? null,
          transportMode: transport.mode ?? transport.transportMode ?? nd.transportMode ?? null,
          buyer: buyer.name ?? null,
          buyerCountry: buyer.country ?? null,
          buyerAddress: buyer.address ?? null,
          seller: seller.name ?? null,
          sellerCountry: seller.country ?? null,
          originCountry: trade.originCountry ?? nd.originCountry ?? null,
          totalPackage: packageInfo.totalPackage ?? nd.totalPackage ?? null,
          packageType: packageInfo.packageType ?? nd.packageType ?? null,
          grossWeight: packageInfo.grossKg ?? packageInfo.grossWeight ?? nd.grossWeight ?? null,
          netWeight: packageInfo.netKg ?? packageInfo.netWeight ?? nd.netWeight ?? null,
          bankInfo: finance.bankInfo ?? nd.bankInfo ?? null
        },
        goodsRows: goods.map((raw, index) => {
          const g = asRecord(raw);
          return {
            rowNo: index + 1,
            productCode: g.productCode ?? null,
            description: g.description ?? null,
            hsCode: g.hsCode ?? null,
            quantity: g.quantity ?? null,
            unit: g.unit ?? null,
            unitPrice: g.unitPrice ?? null,
            lineTotal: g.lineTotal ?? null,
            origin: g.origin ?? null
          };
        })
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
