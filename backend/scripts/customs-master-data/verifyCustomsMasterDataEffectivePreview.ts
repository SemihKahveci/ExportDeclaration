import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { CustomerModel } from "../../src/modules/customers/customer.models.js";
import { CustomsMasterDataModel } from "../../src/modules/customs-master-data/customsMasterData.model.js";

const API_BASE=process.env.CUSTOMS_MASTER_TEST_API_BASE??"http://backend:3000";
const email=process.env.SUPERADMIN_EMAIL,password=process.env.SUPERADMIN_PASSWORD;
if(!email||!password)throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");
async function jr(r:Response){const t=await r.text();let b:any;try{b=t?JSON.parse(t):undefined;}catch{b=t;}return {r,b};}
async function main(){
 await mongoose.connect(env.mongoUri);
 const ids:string[]=[];let customerId:string|undefined;
 try{
  const declaration:any=await mongoose.connection.collection("declarations").findOne({_id:new mongoose.Types.ObjectId("6aad3237ca6e4f9c2d1554f5")});
  assert(declaration?.companyId);const companyId=new mongoose.Types.ObjectId(declaration.companyId);
  const customer=await CustomerModel.create({companyId,name:"CUSTOMS-PREVIEW-TEMP",initials:"CPT",country:"Türkiye"});customerId=String(customer._id);

  const login=await jr(await fetch(`${API_BASE}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}));
  assert.equal(login.r.status,200,JSON.stringify(login.b));const sc=login.r.headers.get("set-cookie");assert(sc);const cookie=sc.split(";",1)[0]!,headers={cookie,"content-type":"application/json"};

  async function create(payload:any){const x=await jr(await fetch(`${API_BASE}/api/customs-master-data`,{method:"POST",headers,body:JSON.stringify(payload)}));assert.equal(x.r.status,201,JSON.stringify(x.b));ids.push(x.b.data.id);return x.b.data;}
  const companyHs=await create({scope:"HS",key:"853620900019",values:{brand:"COMPANY-HS",exemptionCode:"HS-MUAF"}});
  const customerHs=await create({customerId,scope:"HS",key:"853620900019",values:{brand:"CUSTOMER-HS",utsNo:"HS-UTS"}});
  const companyProduct=await create({scope:"PRODUCT",key:"AG.SCH.C25B4",values:{brand:"COMPANY-PRODUCT",permitCode:"COMPANY-PERMIT"}});
  const customerProduct=await create({customerId,scope:"PRODUCT",key:"AG.SCH.C25B4",values:{brand:"CUSTOMER-PRODUCT",usedFlag:"H"}});
  await create({customerId,scope:"DECLARATION_DEFAULT",key:"DEFAULT",values:{regimeCode:"1000",customsOffice:"060200"}});

  async function preview(){return jr(await fetch(`${API_BASE}/api/customs-master-data/effective?customerId=${customerId}&productCode=AG.SCH.C25B4&hsCode=8536.20.90.00.19`,{headers:{cookie}}));}
  const first=await preview();assert.equal(first.r.status,200,JSON.stringify(first.b));
  const data=first.b.data;
  assert.equal(data.effective.line.brand,"CUSTOMER-PRODUCT");
  assert.equal(data.effective.line.exemptionCode,"HS-MUAF");
  assert.equal(data.effective.line.utsNo,"HS-UTS");
  assert.equal(data.effective.line.permitCode,"COMPANY-PERMIT");
  assert.equal(data.effective.line.usedFlag,"H");
  assert.equal(data.effective.declaration.regimeCode,"1000");
  assert.equal(data.effective.declaration.customsOffice,"060200");
  assert.equal(data.trace.line.brand.masterDataId,customerProduct.id);
  assert.equal(data.trace.line.exemptionCode.masterDataId,companyHs.id);
  assert.equal(data.trace.line.utsNo.masterDataId,customerHs.id);
  assert.equal(data.trace.line.permitCode.masterDataId,companyProduct.id);
  assert.equal(data.input.hsCode,"853620900019");

  const off=await jr(await fetch(`${API_BASE}/api/customs-master-data/${customerProduct.id}`,{method:"PATCH",headers,body:JSON.stringify({active:false})}));assert.equal(off.r.status,200);
  const second=await preview();assert.equal(second.r.status,200);assert.equal(second.b.data.effective.line.brand,"COMPANY-PRODUCT");assert.equal(second.b.data.trace.line.brand.masterDataId,companyProduct.id);

  const invalid=await jr(await fetch(`${API_BASE}/api/customs-master-data/effective?customerId=${customerId}`,{headers:{cookie}}));assert.equal(invalid.r.status,400);

  console.log(JSON.stringify({
   event:"customs-master-data.effective-preview.api-integration.passed",
   effectiveBefore:{brand:data.effective.line.brand,exemptionCode:data.effective.line.exemptionCode,utsNo:data.effective.line.utsNo,permitCode:data.effective.line.permitCode,usedFlag:data.effective.line.usedFlag,regimeCode:data.effective.declaration.regimeCode,customsOffice:data.effective.declaration.customsOffice},
   provenanceVerified:true,
   hsInputNormalized:"8536.20.90.00.19 -> 853620900019",
   inactiveFallback:"CUSTOMER-PRODUCT -> COMPANY-PRODUCT",
   missingLookupRejected:true
  },null,2));
 }finally{
  if(ids.length)await CustomsMasterDataModel.deleteMany({_id:{$in:ids.map(id=>new mongoose.Types.ObjectId(id))}});
  if(customerId)await CustomerModel.deleteOne({_id:customerId});
  await mongoose.disconnect();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
