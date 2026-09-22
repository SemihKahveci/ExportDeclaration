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
 const d=await DeclarationModel.create({companyId:base.companyId,status:"DRAFT",createdBy:base.createdBy,operation:{...base.operation,ref:`WF-MT-${Date.now()}`,fileStatus:"beyanname-yazim",workflowHistory:[]}});
 id=d._id as mongoose.Types.ObjectId;await wait();
 const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200);const sc=login.r.headers.get("set-cookie");assert(sc);const headers={cookie:sc.split(";",1)[0]!,"content-type":"application/json"};
 const call=async(body:any)=>jr(await fetch(`${API}/api/declarations/${id}/writing-workflow/transition`,{method:"POST",headers,body:JSON.stringify(body)}));
 let r=await call({action:"APPROVE_MT"});assert.equal(r.r.status,409);
 r=await call({action:"SUBMIT_TO_MT"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.fileStatus,"ic-kontrol");
 r=await call({action:"SUBMIT_TO_MT"});assert.equal(r.r.status,409);
 r=await call({action:"APPROVE_MT"});assert.equal(r.r.status,200);assert.equal(r.b.data.status,"READY");assert.equal(r.b.data.approvalWorkflow.status,"FIRST_PENDING");
 const persisted=await DeclarationModel.findById(id).lean();assert(persisted);assert.equal(persisted.operation?.fileStatus,"ic-kontrol");assert.equal(persisted.status,"READY");assert.equal(persisted.approvalWorkflow?.status,"FIRST_PENDING");
 console.log(JSON.stringify({event:"foundation-5.8C.writing-mt-approval-handoff.passed",prematureMtApprovalRejected:true,writingToMtPersisted:true,duplicateSubmitRejected:true,mtToApprovalPersisted:true,approvalEntryStatus:"FIRST_PENDING"},null,2));
 }finally{if(id)await DeclarationModel.deleteOne({_id:id});await mongoose.disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
