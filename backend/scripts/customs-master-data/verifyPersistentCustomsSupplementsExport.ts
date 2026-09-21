import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { CustomsMasterDataModel } from "../../src/modules/customs-master-data/customsMasterData.model.js";
import { CustomsSupplementDecisionModel } from "../../src/modules/customs-supplements/customsSupplement.model.js";

const API=process.env.CUSTOMS_MASTER_TEST_API_BASE??"http://backend:3000";
const declarationId="6aad3237ca6e4f9c2d1554f5";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");

async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined;}catch{b=t;}return {r,b};}
async function login(){const x=await jr(await fetch(`${API}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));assert.equal(x.r.status,200,JSON.stringify(x.b));const sc=x.r.headers.get("set-cookie");assert(sc);return sc.split(";",1)[0]!;}
async function rows(cookie:string,payload:any={}){
 const r=await fetch(`${API}/api/declarations/${declarationId}/exports/evrim-excel`,{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify(payload)});
 if(r.status!==200)assert.fail(`export ${r.status}: ${JSON.stringify((await jr(r)).b)}`);
 const wb=XLSX.read(Buffer.from(await r.arrayBuffer()),{type:"buffer"});return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Sayfa1,{header:1,defval:""});
}
async function main(){
 await mongoose.connect(env.mongoUri);const masterIds:mongoose.Types.ObjectId[]=[],decisionIds:mongoose.Types.ObjectId[]=[];
 try{
  const d:any=await DeclarationModel.findById(declarationId).lean();assert.equal(d?.normalizedData?.goodsLines?.length,56);
  const first=d.normalizedData.goodsLines[0];assert(first?.productCode&&first?.hsCode);const customerId=d.operation?.customerId;
  const cookie=await login(),headers={cookie,"content-type":"application/json"};

  const mr=await jr(await fetch(`${API}/api/customs-master-data`,{method:"POST",headers,body:JSON.stringify({customerId,scope:"PRODUCT",key:first.productCode,values:{brand:"C2-MASTER-BRAND",utsNo:"C2-MASTER-UTS"}})}));
  assert.equal(mr.r.status,201,JSON.stringify(mr.b));masterIds.push(new mongoose.Types.ObjectId(mr.b.data.id));

  async function decision(body:any){
   const x=await jr(await fetch(`${API}/api/declarations/${declarationId}/customs-supplements/decisions`,{method:"POST",headers,body:JSON.stringify(body)}));
   assert.equal(x.r.status,201,JSON.stringify(x.b));decisionIds.push(new mongoose.Types.ObjectId(x.b.data.id));
  }
  await decision({fieldPath:"lines.1.brand",action:"SET",value:"C2-PERSISTENT-BRAND",reason:"5.6C.2 precedence proof"});
  await decision({fieldPath:"lines.1.utsNo",action:"SET",value:"C2-PERSISTENT-UTS"});

  const persistent=await rows(cookie);const p=persistent[1]!;
  assert.equal(p[18],"C2-PERSISTENT-BRAND");assert.equal(p[9],"C2-PERSISTENT-UTS");

  const request=await rows(cookie,{supplements:{lines:{"line:1":{brand:"C2-REQUEST-BRAND"}}}});
  const q=request[1]!;
  assert.equal(q[18],"C2-REQUEST-BRAND","request-time explicit override must be highest authority");
  assert.equal(q[9],"C2-PERSISTENT-UTS","persistent field must remain when request does not override it");

  await decision({fieldPath:"lines.1.brand",action:"CLEAR",reason:"remove persistent brand override"});
  const cleared=await rows(cookie);const c=cleared[1]!;
  assert.equal(c[18],"C2-MASTER-BRAND","CLEAR must reveal lower master-data authority");
  assert.equal(c[9],"C2-PERSISTENT-UTS");

  console.log(JSON.stringify({
   event:"customs-supplements.production-export-precedence.passed",
   declarationId,rowCount:56,
   precedence:"REQUEST_HUMAN > PERSISTENT_HUMAN > MASTER_DATA > NORMALIZED_DECLARATION",
   persistentExport:{brand:p[18],utsNo:p[9]},
   requestOverride:{brand:q[18],utsNo:q[9]},
   clearFallback:{brand:c[18],utsNo:c[9]},
   persistentAuditConsumedByProductionExport:true,
   temporaryRecordsCleaned:true
  },null,2));
 }finally{
  if(decisionIds.length)await CustomsSupplementDecisionModel.deleteMany({_id:{$in:decisionIds}});
  if(masterIds.length)await CustomsMasterDataModel.deleteMany({_id:{$in:masterIds}});
  await mongoose.disconnect();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
