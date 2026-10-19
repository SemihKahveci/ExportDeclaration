/**
 * Inspect one processing run: Vision parsed qty vs final normalized qty.
 * Usage: npx tsx backend/scripts/idp/inspectRunGoodsAuthority.ts --runId=...
 */
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";

function arg(name: string): string | undefined {
  const hit = process.argv.find((v) => v.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

async function main(): Promise<void> {
  const runId = arg("--runId");
  if (!runId) throw new Error("--runId= required");
  await mongoose.connect(env.mongoUri);
  try {
    const run = await ProcessingRunModel.findById(runId).lean() as any;
    if (!run) throw new Error(`run not found: ${runId}`);
    const declaration = await DeclarationModel.findById(run.declarationId).lean() as any;
    const goods = declaration?.normalizedData?.goodsLines ?? [];
    const arts = run.modelExtractionArtifacts ?? [];
    const visionGoods = arts.map((a: any) => {
      const fields = a.parsedSemanticResponse?.fields ?? [];
      const pick = (name: string) => fields.find((f: any) => f.field === name)?.value;
      return {
        documentId: a.documentId,
        quantity: pick("goodsLines[].quantity"),
        unit: pick("goodsLines[].unit"),
        unitPrice: pick("goodsLines[].unitPrice"),
        lineTotal: pick("goodsLines[].lineTotal"),
        origin: pick("goodsLines[].origin")
      };
    });
    const segments = run.segmentResults ?? [];
    const quantityCandidates = [];
    for (const seg of segments) {
      const list = seg?.data?.fieldCandidates?.fields?.["goodsLines.0.quantity"] ?? [];
      for (const c of list) {
        quantityCandidates.push({
          value: c.value,
          extractor: c.extractor,
          confidence: c.confidence,
          sources: (c.evidence ?? []).map((e: any) => e.contentSource)
        });
      }
    }
    process.stdout.write(`${JSON.stringify({
      runId,
      finalGoods0: goods[0] ?? null,
      visionParsedGoods: visionGoods,
      quantityCandidates
    }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
