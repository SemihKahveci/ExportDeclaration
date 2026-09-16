import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument, CanonicalPage } from "../../src/modules/idp/domain/canonicalDocument.types.js";

function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function text(page: CanonicalPage): string {
  return (page.ocrApplied ? page.ocrText : page.nativeText) || page.nativeText || page.ocrText || "";
}

function topLines(page: CanonicalPage) {
  return page.lines
    .filter(l => l.bbox?.y0 <= 0.40)
    .sort((a,b) => a.bbox.y0-b.bbox.y0 || a.bbox.x0-b.bbox.x0)
    .slice(0, 30)
    .map(l => norm(l.text))
    .filter(Boolean);
}

function interesting(s: string): string[] {
  const pats = [
    /invoice/i, /packing/i, /certificate/i, /origin/i, /eur[\s.\-]*1/i,
    /\ba\.?\s*t\.?\s*r\.?\b/i, /\bcmr\b/i, /bill of lading/i,
    /\bpage\b/i, /\bsayfa\b/i, /\bfatura\b/i
  ];
  return norm(s).split(/(?<=[.!?])\s+|\n+/).filter(x => pats.some(p => p.test(x))).slice(0, 12);
}

async function main() {
  const id=process.argv[2];
  if(!id) throw new Error("Kullanım: npx tsx backend/scripts/idp/dumpSegmentFingerprints.ts <processingRunId>");
  await mongoose.connect(env.mongoUri);
  try {
    const run=await ProcessingRunModel.findById(id).lean();
    if(!run) throw new Error(`ProcessingRun bulunamadı: ${id}`);
    const doc=run.canonicalDocument as CanonicalDocument | undefined;
    if(!doc?.pages?.length) throw new Error("canonicalDocument yok.");

    console.log(JSON.stringify({processingRunId:id,pageCount:doc.pages.length,ocrPageCount:doc.analysis?.ocrPageCount ?? 0},null,2));
    for(const p of [...doc.pages].sort((a,b)=>a.pageNumber-b.pageNumber)){
      const full=text(p);
      const tops=topLines(p);
      console.log(JSON.stringify({
        page:p.pageNumber,
        contentKind:p.contentKind,
        ocrApplied:!!p.ocrApplied,
        wordCount:p.words?.length ?? 0,
        lineCount:p.lines?.length ?? 0,
        topLineCount:tops.length,
        topText:norm(tops.join(" | ")).slice(0,700),
        fallbackText:norm(full).slice(0,500),
        interesting:interesting(full)
      }));
    }
  } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exitCode=1;});
