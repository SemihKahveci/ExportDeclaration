import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { runNormalize } from "../../src/modules/declarations/declaration.service.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";

const COMPANY_ID = "acfad479cc57d647cdfd1f99";
const FIXTURES = [
  { declarationId:"6aad3237ca6e4f9c2d1554f5", currency:"EUR", totalAmount:31081.1, deliveryTerm:"FCA", transportMode:"Karayolu", contentSource:"NATIVE_TEXT", totalEvidence:"31.081,10 EUR" },
  { declarationId:"6aad3295ca6e4f9c2d155507", currency:"EUR", totalAmount:13669.59, deliveryTerm:"FCA", transportMode:"Karayolu", contentSource:"OCR", totalEvidence:"13.669,59 EUR" },
] as const;

type TraceEntry={value?:unknown;source?:string;extractor?:string;evidence?:Array<{text?:string;contentSource?:string}>;processingRunId?:string;uploadedFileId?:string};
function trace(sourceTrace:unknown,field:string):TraceEntry{ assert.ok(sourceTrace&&typeof sourceTrace==="object"); const x=(sourceTrace as Record<string,unknown>)[field]; assert.ok(x&&typeof x==="object",`sourceTrace missing for ${field}`); return x as TraceEntry; }
function assertTrace(sourceTrace:unknown,field:string,expected:unknown,contentSource:string,evidenceText?:string){
  const t=trace(sourceTrace,field); assert.equal(t.value,expected,`${field} trace value mismatch`); assert.equal(t.source,"IDP_GENERIC",`${field} source mismatch`); assert.equal(t.extractor,"invoice-commercial-terms-generic-v2",`${field} extractor mismatch`); assert.ok(t.processingRunId); assert.ok(t.uploadedFileId); assert.ok(t.evidence?.length); assert.equal(t.evidence?.[0]?.contentSource,contentSource); if(evidenceText) assert.equal(t.evidence?.[0]?.text,evidenceText);
}
async function main(){
  await mongoose.connect(env.mongoUri); const companyId=new mongoose.Types.ObjectId(COMPANY_ID); const results=[];
  try{
    for(const f of FIXTURES){
      await runNormalize(companyId,f.declarationId);
      const d=await DeclarationModel.findOne({_id:f.declarationId,companyId}).lean(); assert.ok(d?.normalizedData);
      const n=d.normalizedData as NormalizedDeclaration;
      assert.equal(n.header.currency,f.currency); assert.equal(n.header.totalAmount,f.totalAmount); assert.equal(n.trade.deliveryTerm,f.deliveryTerm); assert.equal(n.transport.mode,f.transportMode);
      assertTrace(d.sourceTrace,"header.currency",f.currency,f.contentSource,f.totalEvidence);
      assertTrace(d.sourceTrace,"header.totalAmount",f.totalAmount,f.contentSource,f.totalEvidence);
      assertTrace(d.sourceTrace,"trade.deliveryTerm",f.deliveryTerm,f.contentSource);
      assertTrace(d.sourceTrace,"transport.mode",f.transportMode,f.contentSource);
      assert.equal(trace(d.sourceTrace,"header.currency").evidence?.[0]?.text,trace(d.sourceTrace,"header.totalAmount").evidence?.[0]?.text,"currency and total must share evidence");
      results.push({declarationId:f.declarationId,currency:n.header.currency,totalAmount:n.header.totalAmount,deliveryTerm:n.trade.deliveryTerm,transportMode:n.transport.mode,contentSource:f.contentSource,canonicalTraceVerified:true});
    }
    console.log(JSON.stringify({event:"idp.invoice-commercial-terms-normalization.regression.passed",results},null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
