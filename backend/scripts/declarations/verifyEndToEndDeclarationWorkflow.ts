import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";

const API=process.env.WORKFLOW_TEST_API_BASE??"http://backend:3000";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password) throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined}catch{b=t}return{r,b}}
async function wait(){for(let i=0;i<20;i++){try{if((await fetch(`${API}/health`)).ok)return}catch{}await new Promise(x=>setTimeout(x,500))}throw new Error("Backend readiness timeout")}
async function main(){
 await mongoose.connect(env.mongoUri);let id:mongoose.Types.ObjectId|undefined;
 try{
  const base=await DeclarationModel.findById("6aad3295ca6e4f9c2d155507").lean();assert(base);
  const d=await DeclarationModel.create({
   companyId:base.companyId,status:"DRAFT",createdBy:base.createdBy,
   operation:{...base.operation,ref:`WF-E2E-${Date.now()}`,fileStatus:"evrak-bekleniyor",tescilStatus:null,tescilNo:null,declarationNo:null,line:null,hasSecondNotif:false,kapanisStatus:null,kapanicDurumu:"",isArchived:false,closedAt:null,workflowHistory:[]},
   approvalWorkflow:{status:"FIRST_PENDING",requiresSecondApproval:false,note:"",history:[],updatedAt:new Date()}
  }); id=d._id as mongoose.Types.ObjectId;
  await UploadedFileModel.insertMany([
   {companyId:base.companyId,declarationId:id,type:"INVOICE",fileName:"e2e-invoice.pdf",storageKey:`e2e/${id}/invoice.pdf`,mimeType:"application/pdf",size:100,sha256:`e2e-${id}-invoice`,extractionStatus:"SUCCESS",parseErrors:[]},
   {companyId:base.companyId,declarationId:id,type:"PACKING_LIST",fileName:"e2e-packing-list.pdf",storageKey:`e2e/${id}/packing.pdf`,mimeType:"application/pdf",size:100,sha256:`e2e-${id}-packing`,extractionStatus:"SUCCESS",parseErrors:[]}
  ]);
  await wait();
  const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200);const sc=login.r.headers.get("set-cookie");assert(sc);const headers={cookie:sc.split(";",1)[0]!,"content-type":"application/json"};
  const call=async(path:string,body:any)=>jr(await fetch(`${API}/api/declarations/${id}/${path}`,{method:"POST",headers,body:JSON.stringify(body)}));

  let r=await call("preparation-workflow/transition",{action:"START_WRITING"});assert.equal(r.r.status,200);assert.equal(r.b.data.declaration.operation.fileStatus,"beyanname-yazim");
  r=await call("writing-workflow/transition",{action:"SUBMIT_TO_MT"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.fileStatus,"ic-kontrol");
  r=await call("writing-workflow/transition",{action:"APPROVE_MT"});assert.equal(r.r.status,200);assert.equal(r.b.data.status,"READY");
  r=await call("approval-workflow/transition",{action:"APPROVE"});assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.status,"APPROVED");assert.equal(r.b.data.operation.fileStatus,"tescil");
  r=await call("registration-workflow/transition",{action:"RECORD_REGISTRATION_STARTED",tescilNo:"E2E-2026-001",line:"Yeşil"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.tescilStatus,"started");
  r=await call("registration-workflow/transition",{action:"COMPLETE_REGISTRATION"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.fileStatus,"kapanis-bekleyen");
  r=await call("closure-workflow/transition",{action:"CLOSE_FILE",note:"5.8F E2E"});assert.equal(r.r.status,200);assert.equal(r.b.data.operation.fileStatus,"kapandi");assert.equal(r.b.data.operation.kapanisStatus,"kapandi");assert.equal(r.b.data.operation.isArchived,true);

  const persisted=await DeclarationModel.findById(id).lean();assert(persisted);
  const docs=await UploadedFileModel.find({declarationId:id}).lean();assert.equal(docs.length,2);
  assert.deepEqual(new Set(docs.map(x=>x.fileName)),new Set(["e2e-invoice.pdf","e2e-packing-list.pdf"]));
  assert.equal(persisted.operation?.workflowHistory.length,6);
  assert.equal(persisted.approvalWorkflow?.history.length,1);
  assert(persisted.operation?.closedAt);
  console.log(JSON.stringify({
   event:"foundation-5.8F.end-to-end-declaration-workflow.passed",
   multiPdfDeclarationVerified:true,
   uploadedFileCount:2,
   preparationToWriting:true,
   writingToMt:true,
   mtToApproval:true,
   approvalToRegistration:true,
   registrationStarted:true,
   registrationCompleted:true,
   closurePersisted:true,
   terminalFileStatus:"kapandi",
   workflowHistoryEntries:6,
   approvalHistoryEntries:1
  },null,2));
 }finally{
  if(id){await UploadedFileModel.deleteMany({declarationId:id});await DeclarationModel.deleteOne({_id:id});}
  await mongoose.disconnect();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
