import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";

const fixtures = [
  { runId: "6aad3238ca6e4f9c2d155501", name: "0146" },
  { runId: "6aad3295ca6e4f9c2d155513", name: "0110" },
] as const;

const norm = (v: unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const yc = (x:any) => (Number(x.bbox.y0)+Number(x.bbox.y1))/2;
const clean = (x:any) => ({text:String(x.text).trim(), bbox:x.bbox, contentSource:x.contentSource});

function dedupe(items:any[]) {
  const seen=new Set<string>();
  return items.filter(x=>{
    const k=`${String(x.text).trim()}|${Number(x.bbox?.x0).toFixed(5)}|${Number(x.bbox?.y0).toFixed(5)}|${Number(x.bbox?.x1).toFixed(5)}|${Number(x.bbox?.y1).toFixed(5)}`;
    if(seen.has(k)) return false; seen.add(k); return true;
  });
}

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const results:any[]=[];
    for(const fixture of fixtures) {
      const run:any=await ProcessingRunModel.findById(fixture.runId).lean();
      assert(run?.canonicalDocument, `canonical missing ${fixture.runId}`);
      const page:any=(run.canonicalDocument.pages??[]).find((p:any)=>p.pageNumber===1);
      assert(page, `page 1 missing ${fixture.runId}`);

      // Prefer canonical lines. Words are fallback only; this avoids duplicate line+word noise.
      let items:any[]=dedupe((page.lines??[]).filter((x:any)=>x?.bbox&&String(x.text??"").trim()));
      if(!items.length) items=dedupe((page.words??[]).filter((x:any)=>x?.bbox&&String(x.text??"").trim()));
      items=items.sort((a:any,b:any)=>yc(a)-yc(b)||Number(a.bbox.x0)-Number(b.bbox.x0));

      const firstGoodsY = Math.min(...items
        .filter((x:any)=>/\b\d{12}\b/.test(String(x.text??"").replace(/\s/g,"")))
        .map((x:any)=>yc(x)), 0.45);
      const headerLimit = Number.isFinite(firstGoodsY) ? Math.max(0.20, firstGoodsY-0.015) : 0.30;
      const header=items.filter((x:any)=>yc(x)<headerLimit);

      const seller=header.find((x:any)=>/VEKMAR ELEKTRIK/.test(norm(x.text)));
      const buyer=header.find((x:any)=>/POWER TECHNOLOGY|COSMIEL GMBH/.test(norm(x.text)));
      const sayin=header.find((x:any)=>norm(x.text).replace(/\s/g,"").includes("SAYIN"));

      function block(anchor:any, nextAnchor:any|undefined, padTop=0.012, padBottom=0.095) {
        if(!anchor) return [];
        const top=Math.max(0,yc(anchor)-padTop);
        const naturalBottom=yc(anchor)+padBottom;
        const bottom=nextAnchor ? Math.min(naturalBottom,yc(nextAnchor)-0.006) : naturalBottom;
        return header.filter((x:any)=>yc(x)>=top&&yc(x)<=bottom).map(clean);
      }

      const sellerBlock=block(seller,sayin,0.012,0.11);
      const buyerAnchor=buyer??sayin;
      const buyerBlock=block(buyerAnchor,undefined,0.012,Math.max(0.04,headerLimit-yc(buyerAnchor??{bbox:{y0:0,y1:0}})));

      results.push({
        fixture:fixture.name, runId:fixture.runId, contentSource:page.contentSource,
        headerLimit, firstGoodsY,
        sellerBlock, buyerBlock,
        semanticPartyEvidence: header.filter((x:any)=>
          /(VKN|VERGI|TAX|VAT|ADDRESS|ADRES|COUNTRY|ULKE|POSTA KODU|POSTAL|TURKIYE|TURKEY|ESTONIA|DEUTSCHLAND)/.test(norm(x.text))
        ).map(clean)
      });
    }
    console.log(JSON.stringify({event:"idp.invoice-party-header.inspection",results},null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
