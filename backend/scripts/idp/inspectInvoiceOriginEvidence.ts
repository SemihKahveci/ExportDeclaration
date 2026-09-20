import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";

const ids=["6aad3238ca6e4f9c2d155501","6aad3295ca6e4f9c2d155513"];
const terms=/(MEN[ŞS]E|ORIGIN|GERMANY|FRANCE|TURKEY|T[ÜU]RKIYE|ITALY|CHINA|SPAIN|POLAND|CZECH|ROMANIA|BULGARIA|HUNGARY|NETHERLANDS|BELGIUM|AUSTRIA|SWEDEN|FINLAND|DENMARK|USA|UNITED STATES)/i;

async function main(){
 await mongoose.connect(env.mongoUri);
 try {
  for(const id of ids){
   const r=await ProcessingRunModel.findById(id).lean();
   if(!r?.canonicalDocument) throw new Error(`canonical missing ${id}`);
   console.log(`\n=== ${id} ===`);
   for(const p of (r.canonicalDocument as any).pages??[]){
    const lines=(p.lines??[]).filter((l:any)=>terms.test(String(l.text??"")));
    for(const l of lines) console.log(JSON.stringify({page:p.pageNumber,text:l.text,bbox:l.bbox,source:l.source}));
   }
  }
 } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
