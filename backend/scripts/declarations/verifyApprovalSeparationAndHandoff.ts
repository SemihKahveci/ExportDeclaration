import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";

const API=process.env.WORKFLOW_TEST_API_BASE??"http://backend:3000";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined}catch{b=t}return{r,b}}
async function wait(){for(let i=0;i<20;i++){try{if((await fetch(`${API}/health`)).ok)return}catch{}await new Promise(x=>setTimeout(x,500))}throw new Error("Backend readiness timeout")}
async function main(){
 await mongoose.connect(env.mongoUri);const ids:mongoose.Types.ObjectId[]=[];
 try{
  const base=await DeclarationModel.findById("6aad3295ca6e4f9c2d155507").lean();assert(base);
  const mk=async(ref:string,second:boolean)=>{
    const d=await DeclarationModel.create({
      companyId:base.companyId,status:"READY",createdBy:base.createdBy,
      operation:{...base.operation,ref,fileStatus:"ic-kontrol",workflowHistory:[]},
      approvalWorkflow:{status:"FIRST_PENDING",requiresSecondApproval:second,note:"",history:[],updatedAt:new Date()}
    });
    ids.push(d._id as mongoose.Types.ObjectId);return d;
  };
  const two=await mk(`WF-2APP-${Date.now()}`,true);
  const ret=await mk(`WF-RETURN-${Date.now()}`,false);
  await wait();
  const login=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));
  assert.equal(login.r.status,200);const sc=login.r.headers.get("set-cookie");assert(sc);
  const headers={cookie:sc.split(";",1)[0]!,"content-type":"application/json"};
  const call=async(id:mongoose.Types.ObjectId,body:any)=>jr(await fetch(`${API}/api/declarations/${id}/approval-workflow/transition`,{method:"POST",headers,body:JSON.stringify(body)}));

  let r=await call(two._id as mongoose.Types.ObjectId,{action:"APPROVE"});
  assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.status,"SECOND_PENDING");

  r=await call(two._id as mongoose.Types.ObjectId,{action:"APPROVE"});
  assert.equal(r.r.status,409);

  // Simulate the same declaration being opened by a distinct second approver without
  // creating a permanent test user: preserve the first approval, replace only its actor id.
  const distinctFirstActor=new mongoose.Types.ObjectId();
  await DeclarationModel.updateOne(
    {_id:two._id,"approvalWorkflow.history.toStatus":"SECOND_PENDING"},
    {$set:{"approvalWorkflow.history.$.actorUserId":distinctFirstActor}}
  );
  r=await call(two._id as mongoose.Types.ObjectId,{action:"APPROVE"});
  assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.status,"APPROVED");assert.equal(r.b.data.operation.fileStatus,"tescil");

  r=await call(ret._id as mongoose.Types.ObjectId,{action:"RETURN_TO_MT"});
  assert.equal(r.r.status,200);assert.equal(r.b.data.approvalWorkflow.status,"RETURNED");assert.equal(r.b.data.operation.fileStatus,"ic-kontrol");

  const persisted=await DeclarationModel.findById(two._id).lean();assert(persisted);
  assert.equal(persisted.approvalWorkflow?.history.length,2);
  assert.notEqual(String(persisted.approvalWorkflow?.history[0]?.actorUserId),String(persisted.approvalWorkflow?.history[1]?.actorUserId));

  console.log(JSON.stringify({
    event:"foundation-5.8D.approval-separation-handoff.passed",
    firstApprovalPersisted:true,
    sameActorSecondApprovalRejected:true,
    distinctActorSecondApprovalAccepted:true,
    finalApprovalMovedToTescil:true,
    returnToMtPersisted:true,
    approvalHistoryAppendOnly:true
  },null,2));
 }finally{
  await DeclarationModel.deleteMany({_id:{$in:ids}});
  await mongoose.disconnect();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
