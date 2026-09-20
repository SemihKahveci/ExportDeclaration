import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { runNormalize } from "../../src/modules/declarations/declaration.service.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";

const fixtures=[
 {name:"0146",declarationId:"6aad3237ca6e4f9c2d1554f5",lines:56},
 {name:"0110",declarationId:"6aad3295ca6e4f9c2d155507",lines:41}
] as const;

const requiredDocumentFields=[
 "header.invoiceNo","header.invoiceDate","header.currency","header.totalAmount",
 "parties.seller.name","parties.seller.taxNo","parties.seller.address",
 "parties.buyer.name","parties.buyer.address","parties.buyer.country",
 "trade.deliveryTerm","transport.mode",
 "packageInfo.totalPackage","packageInfo.packageType","packageInfo.grossKg","packageInfo.netKg"
];

async function main(){
 await mongoose.connect(env.mongoUri);
 try{
  const results:any[]=[];
  for(const f of fixtures){
   const persisted:any=await DeclarationModel.findById(f.declarationId).select({companyId:1}).lean();
   assert(persisted?.companyId,`${f.name} declaration/companyId missing`);
   const declaration:any=await runNormalize(persisted.companyId,f.declarationId);
   const n:any=declaration.normalizedData;
   const trace:any=declaration.sourceTrace ?? {};
   assert(n,`${f.name} normalizedData missing`);
   assert.equal(n.goodsLines.length,f.lines);

   for(const field of requiredDocumentFields){
    assert.equal(trace[field]?.source,"IDP_GENERIC",`${f.name} ${field} must be IDP_GENERIC`);
    assert(trace[field]?.candidateId,`${f.name} ${field} candidateId missing`);
    assert(trace[field]?.evidence?.length,`${f.name} ${field} evidence missing`);
   }
   for(let i=0;i<n.goodsLines.length;i++){
    for(const key of ["hsCode","productCode","description","quantity","unit","unitPrice","lineTotal","origin"]){
     const field=`goodsLines.${i}.${key}`;
     assert(["IDP_GENERIC","HUMAN_REVIEW"].includes(trace[field]?.source),`${f.name} ${field} has non-canonical authority`);
     if(trace[field]?.source==="IDP_GENERIC") assert(trace[field]?.evidence?.length,`${f.name} ${field} evidence missing`);
    }
    assert.equal(n.goodsLines[i].grossKg,undefined,`${f.name} line grossKg must not be synthesized`);
    assert.equal(n.goodsLines[i].netKg,undefined,`${f.name} line netKg must not be synthesized`);
   }

   assert.equal(n.parties?.notify,undefined,`${f.name} notify must remain absent without canonical evidence`);
   assert.equal(n.trade?.paymentType,undefined,`${f.name} paymentType must remain absent without canonical evidence`);
   assert.equal(n.trade?.origin,undefined,`${f.name} trade.origin must remain absent; origin is row-level`);

   for(const [field,t] of Object.entries(trace) as [string,any][]){
    assert(t?.source !== null,`${f.name} ${field} has untraced/null source`);
    if(requiredDocumentFields.includes(field) || field.startsWith("goodsLines.")){
     assert(!["INVOICE","E_INVOICE_XML","EXPORT_INVOICE","PROFORMA"].includes(t?.source),
       `${f.name} ${field} still uses legacy document authority ${t?.source}`);
    }
   }

   const contract=buildExportDeclarationContract(n);
   assert.equal(contract.readiness.ready,true,`${f.name} export contract must remain READY`);
   assert.equal(contract.lines.length,f.lines);
   assert(contract.lines.every((x:any)=>x.origin),`${f.name} every export line must keep row origin`);

   results.push({
    fixture:f.name,
    lines:f.lines,
    requiredCanonicalFields:requiredDocumentFields.length,
    notifyAbsent:true,
    paymentTypeAbsent:true,
    documentOriginAbsent:true,
    lineWeightsNotSynthesized:true,
    legacyAuthorityCount:0,
    derivedUntracedCount:0,
    exportReady:true
   });
  }
  console.log(JSON.stringify({
   event:"idp.invoice-legacy-coverage.final-regression.passed",
   policy:"CANONICAL_EVIDENCE_ONLY_FOR_ACTIVE_INVOICE_FIELDS",
   totalLines:results.reduce((a,x)=>a+x.lines,0),
   results
  },null,2));
 } finally {await mongoose.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
