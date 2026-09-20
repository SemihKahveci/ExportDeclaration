import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";

const fixtures = [
  { runId: "6aad3238ca6e4f9c2d155501", name: "0146" },
  { runId: "6aad3295ca6e4f9c2d155513", name: "0110" },
] as const;

function norm(s: unknown): string {
  return String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
function yCenter(x:any): number { return (Number(x?.bbox?.y0 ?? 0)+Number(x?.bbox?.y1 ?? 0))/2; }
function x0(x:any): number { return Number(x?.bbox?.x0 ?? 0); }

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const results:any[]=[];
    for (const fixture of fixtures) {
      const run:any=await ProcessingRunModel.findById(fixture.runId).lean();
      assert(run?.canonicalDocument, `canonical missing ${fixture.runId}`);
      const pages:any[]=run.canonicalDocument.pages ?? [];
      const page=pages.find((p:any)=>p.pageNumber===1) ?? pages[0];
      const items:any[]=[...(page?.lines ?? []), ...(page?.words ?? [])]
        .filter((x:any)=>x?.bbox && String(x?.text ?? "").trim());

      const interesting=items.filter((item:any)=>{
        const t=norm(item.text);
        return /(SAYIN|VERGI|VKN|TAX|VAT|ADRES|ADDRESS|ULKE|COUNTRY|TURKIYE|TURKEY|ESTONIA|GERMANY|DEUTSCHLAND|GMBH|OU|VEKMAR)/.test(t);
      }).sort((a:any,b:any)=>yCenter(a)-yCenter(b)||x0(a)-x0(b));

      const sellerName=items.find((x:any)=>norm(x.text).includes("VEKMAR ELEKTRIK"));
      const sayin=items.find((x:any)=>norm(x.text).replace(/\s/g,"").includes("SAYIN"));
      const buyerName=items.find((x:any)=>/POWER TECHNOLOGY|COSMIEL GMBH/.test(norm(x.text)));

      function windowAround(anchor:any, radius=0.085) {
        if(!anchor) return [];
        const y=yCenter(anchor);
        return items.filter((x:any)=>Math.abs(yCenter(x)-y)<=radius)
          .sort((a:any,b:any)=>yCenter(a)-yCenter(b)||x0(a)-x0(b))
          .map((x:any)=>({text:x.text,bbox:x.bbox,contentSource:x.contentSource ?? page?.contentSource}));
      }

      results.push({
        fixture:fixture.name, runId:fixture.runId, contentSource:page?.contentSource,
        anchors:{
          seller:sellerName?{text:sellerName.text,bbox:sellerName.bbox}:null,
          sayin:sayin?{text:sayin.text,bbox:sayin.bbox}:null,
          buyer:buyerName?{text:buyerName.text,bbox:buyerName.bbox}:null
        },
        sellerWindow:windowAround(sellerName),
        buyerWindow:windowAround(buyerName),
        interesting:interesting.map((x:any)=>({text:x.text,bbox:x.bbox,contentSource:x.contentSource ?? page?.contentSource}))
      });
    }
    console.log(JSON.stringify({event:"idp.invoice-party-evidence.inspection",results},null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
