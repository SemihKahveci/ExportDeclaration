import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { getHumanReviewCase } from "../../src/modules/idp/review/humanReview.service.js";
import { runNormalize } from "../../src/modules/declarations/declaration.service.js";

const fixtures=[
 {name:"0146",runId:"6aad3238ca6e4f9c2d155501",declarationId:"6aad3237ca6e4f9c2d1554f5",country:"ESTONYA"},
 {name:"0110",runId:"6aad3295ca6e4f9c2d155513",declarationId:"6aad3295ca6e4f9c2d155507",country:"ALMANYA"}
] as const;

async function main(){
 await mongoose.connect(env.mongoUri);
 try{
  const results:any[]=[];
  for(const f of fixtures){
   const run:any=await ProcessingRunModel.findById(f.runId).lean();
   assert(run,`run missing ${f.runId}`);
   const review=await getHumanReviewCase(run.companyId,f.runId,f.declarationId);
   assert(!review.issues.some((x:any)=>x.code==="ORIGIN_MISSING"),`${f.name} old-run review reconstructed origin incorrectly`);
   const declaration:any=await runNormalize(run.companyId,f.declarationId);
   const normalized:any=declaration?.normalizedData;
   assert(normalized,`${f.name} normalizedData missing from declaration`);
   assert.equal(normalized?.parties?.seller?.taxNo,"9240241537");
   assert(normalized?.parties?.seller?.address,`${f.name} seller address missing after normalize`);
   assert(normalized?.parties?.buyer?.address,`${f.name} buyer address missing after normalize`);
   assert.equal(normalized?.parties?.buyer?.country,f.country);
   const trace=declaration?.sourceTrace ?? {};
   for(const field of ["parties.seller.taxNo","parties.seller.address","parties.buyer.address","parties.buyer.country"]){
    assert.equal(trace[field]?.source,"IDP_GENERIC",`${f.name} ${field} not canonical-promoted`);
    assert(trace[field]?.evidence?.length,`${f.name} ${field} evidence missing`);
   }
   results.push({
    fixture:f.name,
    pendingReview:review.pendingIssueCount,
    sellerTaxNo:normalized.parties.seller.taxNo,
    sellerAddress:normalized.parties.seller.address,
    buyerAddress:normalized.parties.buyer.address,
    buyerCountry:normalized.parties.buyer.country,
    tracesVerified:true
   });
  }
  console.log(JSON.stringify({event:"idp.invoice-party-details.normalization-review.regression.passed",results},null,2));
 } finally {await mongoose.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
