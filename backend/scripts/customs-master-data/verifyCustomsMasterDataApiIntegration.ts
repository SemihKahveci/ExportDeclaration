import assert from "node:assert/strict";
import mongoose from "mongoose";import { env } from "../../src/config/env.js";import { CustomsMasterDataModel } from "../../src/modules/customs-master-data/customsMasterData.model.js";
const API_BASE=process.env.CUSTOMS_MASTER_TEST_API_BASE??"http://backend:3000",email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined;}catch{b=t;}return {r,b};}
async function main(){await mongoose.connect(env.mongoUri);const ids:mongoose.Types.ObjectId[]=[];try{
 const login=await jr(await fetch(`${API_BASE}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200,JSON.stringify(login.b));const sc=login.r.headers.get("set-cookie");assert(sc);const cookie=sc.split(";",1)[0]!,headers={cookie,"content-type":"application/json"};
 const c=await jr(await fetch(`${API_BASE}/api/customs-master-data`,{method:"POST",headers,body:JSON.stringify({customerId:"API-TEST-CUSTOMER",scope:"PRODUCT",key:"API-TEST-PRODUCT",values:{brand:"API BRAND",utsNo:"UTS-API"}})}));assert.equal(c.r.status,201,JSON.stringify(c.b));const id=c.b.data.id;ids.push(new mongoose.Types.ObjectId(id));
 const l=await jr(await fetch(`${API_BASE}/api/customs-master-data?customerId=API-TEST-CUSTOMER&scope=PRODUCT`,{headers:{cookie}}));assert.equal(l.r.status,200);assert(l.b.data.some((x:any)=>x.id===id));
 const p=await jr(await fetch(`${API_BASE}/api/customs-master-data/${id}`,{method:"PATCH",headers,body:JSON.stringify({values:{brand:"UPDATED BRAND",permitCode:"PERMIT-1"}})}));assert.equal(p.r.status,200);assert.equal(p.b.data.values.brand,"UPDATED BRAND");
 const bad=await jr(await fetch(`${API_BASE}/api/customs-master-data`,{method:"POST",headers,body:JSON.stringify({scope:"PRODUCT",key:"INVALID",values:{customsOffice:"NO"}})}));assert.equal(bad.r.status,400);
 const dup=await jr(await fetch(`${API_BASE}/api/customs-master-data`,{method:"POST",headers,body:JSON.stringify({customerId:"API-TEST-CUSTOMER",scope:"PRODUCT",key:"API-TEST-PRODUCT",values:{brand:"DUP"}})}));assert.equal(dup.r.status,409);
 const d=await jr(await fetch(`${API_BASE}/api/customs-master-data/${id}`,{method:"DELETE",headers:{cookie}}));assert.equal(d.r.status,200);ids.length=0;
 const missing=await jr(await fetch(`${API_BASE}/api/customs-master-data/${id}`,{method:"PATCH",headers,body:JSON.stringify({active:false})}));assert.equal(missing.r.status,404);
 console.log(JSON.stringify({event:"customs-master-data.api-integration.passed",create:true,list:true,update:true,scopeValidation:true,duplicateRejected:true,delete:true,tenantScopedCrud:true},null,2));
}finally{if(ids.length)await CustomsMasterDataModel.deleteMany({_id:{$in:ids}});await mongoose.disconnect();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
