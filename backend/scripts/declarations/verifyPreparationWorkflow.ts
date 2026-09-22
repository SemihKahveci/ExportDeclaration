import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
const API=process.env.WORKFLOW_TEST_API_BASE??"http://backend:3000",email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined}catch{b=t}return{r,b}}
async function wait(){for(let i=0;i<20;i++){try{if((await fetch(`${API}/health`)).ok)return}catch{}await new Promise(x=>setTimeout(x,500))}throw new Error("Backend readiness timeout")}
async function main(){await mongoose.connect(env.mongoUri);const ids:mongoose.Types.ObjectId[]=[];try{
 const base=await DeclarationModel.findById("6aad3295ca6e4f9c2d155507").lean();assert(base);
 const mk=async(ref:string)=>{const d=await DeclarationModel.create({companyId:base.companyId,status:"READY",createdBy:base.createdBy,operation:{...base.operation,ref,fileStatus:"evrak-bekleniyor",workflowHistory:[]}});ids.push(d._id as mongoose.Types.ObjectId);return d};
 const ready=await mk(`WF-READY-${Date.now()}`),blocked=await mk(`WF-BLOCK-${Date.now()}`);
 await UploadedFileModel.create([{companyId:base.companyId,declarationId:ready._id,type:"INVOICE",fileName:"ready.pdf",extractionStatus:"SUCCESS"},{companyId:base.companyId,declarationId:blocked._id,type:"INVOICE",fileName:"pending.pdf",extractionStatus:"PENDING"}]);
 await wait();const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(login.r.status,200);const sc=login.r.headers.get("set-cookie");assert(sc);const headers={cookie:sc.split(";",1)[0]!,"content-type":"application/json"};
 const call = async (id: any, body: any) =>
    jr(
      await fetch(
        `${API}/api/declarations/${id}/preparation-workflow/transition`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      )
    );
 let r=await call(ready._id,{action:"START_WRITING"});assert.equal(r.r.status,200);assert.equal(r.b.data.declaration.operation.fileStatus,"beyanname-yazim");assert.equal(r.b.data.declaration.operation.workflowHistory.at(-1).override,false);
 r=await call(blocked._id,{action:"START_WRITING"});assert.equal(r.r.status,409);
 r=await call(blocked._id,{action:"START_WRITING_WITH_MISSING_DOCUMENTS"});assert.equal(r.r.status,400);
 r=await call(blocked._id,{action:"START_WRITING_WITH_MISSING_DOCUMENTS",reason:"Müşteri evrakı sonradan iletecek"});assert.equal(r.r.status,200);assert.equal(r.b.data.declaration.operation.fileStatus,"beyanname-yazim");assert.equal(r.b.data.declaration.operation.workflowHistory.at(-1).override,true);assert.equal(r.b.data.declaration.operation.workflowHistory.at(-1).reason,"Müşteri evrakı sonradan iletecek");
 console.log(JSON.stringify({event:"foundation-5.8B.preparation-workflow.passed",normalReadyTransition:true,notReadyRejected:true,overrideReasonRequired:true,overrideAudited:true,persistentStage:"beyanname-yazim"},null,2));
 }finally{await UploadedFileModel.deleteMany({declarationId:{$in:ids}});await DeclarationModel.deleteMany({_id:{$in:ids}});await mongoose.disconnect()}}
main().catch(e=>{console.error(e);process.exitCode=1});
