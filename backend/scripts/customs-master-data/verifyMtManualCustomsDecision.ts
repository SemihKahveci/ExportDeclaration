import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { CustomsSupplementDecisionModel } from "../../src/modules/customs-supplements/customsSupplement.model.js";

const API=process.env.CUSTOMS_MASTER_TEST_API_BASE??"http://backend:3000";
const declarationId="6aad3295ca6e4f9c2d155507";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function waitForBackend(){let last:unknown;for(let i=0;i<20;i++){try{const r=await fetch(`${API}/api/auth/login`,{method:"OPTIONS"});if(r.status<500)return;}catch(e){last=e;}await new Promise(resolve=>setTimeout(resolve,500));}throw last??new Error("Backend readiness timeout");}
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined;}catch{b=t;}return {r,b};}
async function main(){
 await mongoose.connect(env.mongoUri);const ids:mongoose.Types.ObjectId[]=[];
 try{
  await waitForBackend();
  const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200,JSON.stringify(login.b));
  const sc=login.r.headers.get("set-cookie");assert(sc);const cookie=sc.split(";",1)[0]!,headers={cookie,"content-type":"application/json"};
  const before=await jr(await fetch(`${API}/api/declarations/${declarationId}/control-provenance`,{headers:{cookie}}));assert.equal(before.r.status,200,JSON.stringify(before.b));
  const original=before.b.data.entries.find((x:any)=>/^lines\.\d+\.origin$/.test(x.path)&&x.authority==="NORMALIZED_DECLARATION"&&x.evidence?.bbox);
  assert(original,"No clean NORMALIZED_DECLARATION line origin with physical evidence is available for the regression");
  const path=original.path;
  const set=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/decisions`,{method:"POST",headers,body:JSON.stringify({fieldPath:path,action:"SET",value:"MT-UI-TEST",reason:"5.7E regression"})}));assert.equal(set.r.status,201,JSON.stringify(set.b));ids.push(new mongoose.Types.ObjectId(set.b.data.id));
  const after=await jr(await fetch(`${API}/api/declarations/${declarationId}/control-provenance`,{headers:{cookie}}));assert.equal(after.r.status,200,JSON.stringify(after.b));
  const human=after.b.data.entries.find((x:any)=>x.path===path);assert(human);assert.equal(human.value,"MT-UI-TEST");assert.equal(human.authority,"PERSISTENT_HUMAN");assert.equal(human.human.decisionId,set.b.data.id);assert.equal(human.human.reason,"5.7E regression");
  const clear=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/decisions`,{method:"POST",headers,body:JSON.stringify({fieldPath:path,action:"CLEAR",reason:"5.7E regression cleanup"})}));assert.equal(clear.r.status,201,JSON.stringify(clear.b));ids.push(new mongoose.Types.ObjectId(clear.b.data.id));
  const restored=await jr(await fetch(`${API}/api/declarations/${declarationId}/control-provenance`,{headers:{cookie}}));assert.equal(restored.r.status,200,JSON.stringify(restored.b));
  const back=restored.b.data.entries.find((x:any)=>x.path===path);assert(back);assert.equal(back.value,original.value);assert.equal(back.authority,"NORMALIZED_DECLARATION");assert(back.evidence?.bbox);
  console.log(JSON.stringify({event:"mt-control.manual-customs-decision.integration.passed",declarationId,path,originalValue:original.value,manualValue:"MT-UI-TEST",persistentHumanApplied:true,appendOnlyClearRestoredSource:true,originalPhysicalEvidenceRestored:true},null,2));
 } finally { if(ids.length)await CustomsSupplementDecisionModel.deleteMany({_id:{$in:ids}});await mongoose.disconnect(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
