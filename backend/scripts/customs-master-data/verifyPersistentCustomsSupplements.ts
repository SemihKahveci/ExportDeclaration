import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { CustomsSupplementDecisionModel } from "../../src/modules/customs-supplements/customsSupplement.model.js";
const API=process.env.CUSTOMS_MASTER_TEST_API_BASE??"http://backend:3000",declarationId="6aad3237ca6e4f9c2d1554f5";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined;}catch{b=t;}return {r,b};}
async function main(){await mongoose.connect(env.mongoUri);const ids:mongoose.Types.ObjectId[]=[];try{
 const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200,JSON.stringify(login.b));const sc=login.r.headers.get("set-cookie");assert(sc);const cookie=sc.split(";",1)[0]!,headers={cookie,"content-type":"application/json"};
 async function append(body:any){const x=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/decisions`,{method:"POST",headers,body:JSON.stringify(body)}));assert.equal(x.r.status,201,JSON.stringify(x.b));ids.push(new mongoose.Types.ObjectId(x.b.data.id));return x.b.data;}
 const a=await append({fieldPath:"lines.1.brand",action:"SET",value:"AUDIT-BRAND-1",reason:"initial"});
 const b=await append({fieldPath:"lines.1.brand",action:"SET",value:"AUDIT-BRAND-2",reason:"correction"});
 await append({fieldPath:"regimeCode",action:"SET",value:"1000"});
 await append({fieldPath:"lines.1.utsNo",action:"SET",value:"UTS-PERSIST"});
 await append({fieldPath:"lines.1.utsNo",action:"CLEAR",reason:"remove UTS override"});
 assert.notEqual(a.id,b.id);
 const history=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements`,{headers:{cookie}}));assert.equal(history.r.status,200);assert.equal(history.b.data.length,5);
 const eff=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/effective`,{headers:{cookie}}));assert.equal(eff.r.status,200);assert.equal(eff.b.data.regimeCode,"1000");assert.equal(eff.b.data.lines["line:1"].brand,"AUDIT-BRAND-2");assert.equal(eff.b.data.lines["line:1"].utsNo,undefined);
 const badLine=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/decisions`,{method:"POST",headers,body:JSON.stringify({fieldPath:"lines.999.brand",action:"SET",value:"X"})}));assert.equal(badLine.r.status,400);
 const badField=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/decisions`,{method:"POST",headers,body:JSON.stringify({fieldPath:"lines.1.discount",action:"SET",value:"X"})}));assert.equal(badField.r.status,400);
 let immutable=false;try{await CustomsSupplementDecisionModel.updateOne({_id:ids[0]},{$set:{value:"MUTATED"}});}catch{immutable=true;}assert.equal(immutable,true);
 console.log(JSON.stringify({event:"customs-supplements.persistence.api-integration.passed",appendOnlyHistory:5,latestWins:true,clearAction:true,lineBoundaryProtected:true,unknownFieldRejected:true,immutableUpdateRejected:true,effective:{regimeCode:eff.b.data.regimeCode,brand:eff.b.data.lines["line:1"].brand,utsNo:"CLEARED"}},null,2));
}finally{if(ids.length)await CustomsSupplementDecisionModel.deleteMany({_id:{$in:ids}});await mongoose.disconnect();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
