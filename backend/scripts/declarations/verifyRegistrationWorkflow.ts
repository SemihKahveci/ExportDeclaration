import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
const API=process.env.WORKFLOW_TEST_API_BASE??"http://backend:3000",email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined}catch{b=t}return{r,b}}
async function wait(){for(let i=0;i<20;i++){try{if((await fetch(`${API}/health`)).ok)return}catch{}await new Promise(x=>setTimeout(x,500))}throw new Error("Backend readiness timeout")}
async function main(){await mongoose.connect(env.mongoUri);let id:mongoose.Types.ObjectId|undefined;try{
 const base=await DeclarationModel.findById("6aad3295ca6e4f9c2d155507").lean();assert(base);
 const d=await DeclarationModel.create({companyId:base.companyId,status:"READY",createdBy:base.createdBy,operation:{...base.operation,ref:`WF-REG-${Date.now()}`,fileStatus:"tescil",tescilStatus:null,tescilNo:null,declarationNo:null,line:null,hasSecondNotif:false,kapanisStatus:null,workflowHistory:[]}});
 id=d._id as mongoose.Types.ObjectId;await wait();
 const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200);const sc=login.r.headers.get("set-cookie");assert(sc);const headers={cookie:sc.split(";",1)[0]!,"content-type":"application/json"};
 const call=async(body:any)=>jr(await fetch(`${API}/api/declarations/${id}/registration-workflow/transition`,{method:"POST",headers,body:JSON.stringify(body)}));
 let r=await call({action:"COMPLETE_REGISTRATION"});assert.equal(r.r.status,409);
 r=await call({action:"RECORD_REGISTRATION_STARTED",tescilNo:""});assert.equal(r.r.status,400);
 r=await call({action:"RECORD_REGISTRATION_STARTED",tescilNo:"TEST-2026-001",line:"Mavi"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.tescilStatus,"started");assert.equal(r.b.data.operation.fileStatus,"tescil");
 r=await call({action:"RECORD_REGISTRATION_STARTED",tescilNo:"TEST-2026-002",line:"Yeşil"});assert.equal(r.r.status,409);
 r=await call({action:"COMPLETE_REGISTRATION"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.tescilStatus,"completed");assert.equal(r.b.data.operation.fileStatus,"kapanis-bekleyen");assert.equal(r.b.data.operation.kapanisStatus,"kontrol-bekliyor");
 const persisted=await DeclarationModel.findById(id).lean();assert(persisted);assert.equal(persisted.operation?.workflowHistory.length,2);
 console.log(JSON.stringify({event:"foundation-5.8E.registration-workflow.passed",completionBeforeStartRejected:true,registrationIdentityRequired:true,startPersisted:true,duplicateStartRejected:true,completionPersisted:true,closureHandoffPersisted:true,workflowHistoryEntries:2},null,2));
 }finally{if(id)await DeclarationModel.deleteOne({_id:id});await mongoose.disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
