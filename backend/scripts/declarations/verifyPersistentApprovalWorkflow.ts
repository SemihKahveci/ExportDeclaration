import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";

const API=process.env.WORKFLOW_TEST_API_BASE??"http://backend:3000";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined}catch{b=t}return{r,b}}
async function wait(){for(let i=0;i<20;i++){try{const r=await fetch(`${API}/health`);if(r.ok)return}catch{}await new Promise(x=>setTimeout(x,500))}throw new Error("Backend readiness timeout")}
async function main(){
 await mongoose.connect(env.mongoUri); let id:mongoose.Types.ObjectId|undefined;
 try{
  const fixture=await DeclarationModel.findById("6aad3295ca6e4f9c2d155507").lean();assert(fixture);
  const created=await DeclarationModel.create({
   companyId:fixture.companyId,status:"READY",createdBy:fixture.createdBy,
   operation:{...fixture.operation,ref:`WF-TEST-${Date.now()}`,fileStatus:"ic-kontrol",lastActivity:"5.8A regression"}
  }); id=created._id as mongoose.Types.ObjectId;
  await wait();
  const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200);
  const sc=login.r.headers.get("set-cookie");assert(sc);const cookie=sc.split(";",1)[0]!,headers={cookie,"content-type":"application/json"};
  const call=async(body:any)=>jr(await fetch(`${API}/api/declarations/${id}/approval-workflow/transition`,{method:"POST",headers,body:JSON.stringify(body)}));

  let r=await call({action:"SET_SECOND_APPROVAL_REQUIRED",requiresSecondApproval:true});assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.requiresSecondApproval,true);
  r=await call({action:"SAVE_NOTE",note:"5.8A persistent note"});assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.note,"5.8A persistent note");
  r=await call({action:"APPROVE"});assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.status,"SECOND_PENDING");
  r=await call({action:"APPROVE"});assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.status,"APPROVED");assert.equal(r.b.data.operation.fileStatus,"tescil");

  const persisted=await DeclarationModel.findById(id).lean();assert(persisted);assert.equal(persisted.approvalWorkflow?.status,"APPROVED");assert.equal(persisted.approvalWorkflow?.history.length,4);
  const invalid=await call({action:"RETURN_TO_MT"});assert.equal(invalid.r.status,409);

  console.log(JSON.stringify({event:"foundation-5.8A.persistent-approval-workflow.passed",declarationId:String(id),secondApprovalPersisted:true,notePersisted:true,approvalPersisted:true,registrationStagePersisted:true,invalidTransitionRejected:true,historyEntries:4},null,2));
 }finally{if(id)await DeclarationModel.deleteOne({_id:id});await mongoose.disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
