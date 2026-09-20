import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";

const fixtures=[
 {name:"0146",runId:"6aad3238ca6e4f9c2d155501",source:"NATIVE_TEXT",buyerCountry:"ESTONYA"},
 {name:"0110",runId:"6aad3295ca6e4f9c2d155513",source:"OCR",buyerCountry:"ALMANYA"}
] as const;

async function main(){
 await mongoose.connect(env.mongoUri);
 try{
  const results:any[]=[];
  for(const f of fixtures){
   const run:any=await ProcessingRunModel.findById(f.runId).lean();
   assert(run?.canonicalDocument,`canonical missing ${f.runId}`);
   const e=discoverInvoiceHeaderPartyFieldCandidates(run.canonicalDocument,"segment-001");
   const one=(field:string)=>e.fields[field]?.[0];
   assert.equal(one("parties.seller.taxNo")?.value,"9240241537");
   assert.equal(one("parties.seller.taxNo")?.evidence?.[0]?.contentSource,f.source);
   assert(one("parties.seller.address"),`${f.name} seller address missing`);
   assert(one("parties.buyer.address"),`${f.name} buyer address missing`);
   assert.equal(one("parties.buyer.country")?.value,f.buyerCountry,`${f.name} buyer country mismatch`);
   assert(Number(one("parties.buyer.country")?.evidence?.[0]?.bbox?.y1) < 0.28, `${f.name} buyer country leaked outside party header`);
   for(const field of ["parties.seller.taxNo","parties.seller.address","parties.buyer.address","parties.buyer.country"]){
    const c=one(field); assert(c?.evidence?.[0]?.bbox,`${f.name} ${field} bbox missing`);
    assert(c?.evidence?.[0]?.text,`${f.name} ${field} text missing`);
    assert.equal(c?.evidence?.[0]?.pageNumber,1,`${f.name} ${field} must come from page 1 party block`);
   }
   const addresses=[String(one("parties.seller.address")?.value??""),String(one("parties.buyer.address")?.value??"")].join(" | ").toUpperCase();
   for(const forbidden of ["AG.EAT.","AG.SCH.","BASIC FRAME","LAMBASI KAFASI","BUTON KAFASI","LEDLI","NSX250","GTIP"]){
    assert(!addresses.includes(forbidden),`${f.name} address leaked goods text: ${forbidden}`);
   }
   if(f.name==="0146"){
    assert.equal(one("parties.seller.address")?.value,"8. Cadde İtosb No:7, 34959 Tepeören / Tuzla/ İSTANBUL");
   }
   if(f.name==="0110"){
    assert.equal(one("parties.seller.address")?.value,"8. Cadde Itosb No:7, 34959 Tepeören / Tuzla/ ISTANBUL");
    assert.equal(one("parties.buyer.address")?.value,"MUTHESIUSSTR. G 12163 DE, 11111 BERLIN/ BERLIN");
   }
   results.push({fixture:f.name,sellerTaxNo:one("parties.seller.taxNo")?.value,sellerAddress:one("parties.seller.address")?.value,buyerAddress:one("parties.buyer.address")?.value,buyerCountry:one("parties.buyer.country")?.value,contentSource:f.source});
  }
  console.log(JSON.stringify({event:"idp.invoice-party-details.production-regression.passed",results},null,2));
 } finally {await mongoose.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
