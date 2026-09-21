import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { CustomerModel } from "../../src/modules/customers/customer.models.js";
import { deleteCustomer } from "../../src/modules/customers/customer.service.js";
import { CustomsMasterDataModel } from "../../src/modules/customs-master-data/customsMasterData.model.js";
import { createCustomsMasterData, listCustomsMasterData } from "../../src/modules/customs-master-data/customsMasterData.service.js";

async function expectStatus(fn:()=>Promise<unknown>,status:number){
 try{await fn();assert.fail(`Expected HTTP ${status}`);}catch(e:any){assert.equal(e?.statusCode??e?.status,status,e?.message);}
}
async function main(){
 await mongoose.connect(env.mongoUri);
 const declaration:any=await mongoose.connection.collection("declarations").findOne({_id:new mongoose.Types.ObjectId("6aad3237ca6e4f9c2d1554f5")});
 assert(declaration?.companyId);
 const companyId=new mongoose.Types.ObjectId(declaration.companyId);
 let customerId:string|undefined;
 const createdIds:mongoose.Types.ObjectId[]=[];
 try{
  const customer=await CustomerModel.create({companyId,name:"CUSTOMS-INTEGRITY-TEMP",initials:"CIT",country:"Türkiye"});
  customerId=String(customer._id);

  const hs:any=await createCustomsMasterData(companyId,{customerId,scope:"HS",key:"8536.20.90.00.19",values:{exemptionCode:"TEST-HS"}});
  createdIds.push(new mongoose.Types.ObjectId(hs.id));
  assert.equal(hs.key,"853620900019");

  const product:any=await createCustomsMasterData(companyId,{customerId,scope:"PRODUCT",key:" AG.SCH.C25B4 ",values:{brand:"TEST-BRAND"}});
  createdIds.push(new mongoose.Types.ObjectId(product.id));
  assert.equal(product.key,"AG.SCH.C25B4");

  const listed:any[]=await listCustomsMasterData(companyId,{customerId,scope:"HS",key:"8536 20 90 00 19"});
  assert.equal(listed.length,1);assert.equal(listed[0].id,hs.id);

  await expectStatus(()=>createCustomsMasterData(companyId,{scope:"HS",key:"85362090",values:{brand:"X"}}),400);
  await expectStatus(()=>createCustomsMasterData(companyId,{scope:"HS",key:"85362090AB19",values:{brand:"X"}}),400);
  await expectStatus(()=>createCustomsMasterData(companyId,{customerId:new mongoose.Types.ObjectId().toString(),scope:"PRODUCT",key:"X",values:{brand:"X"}}),404);

  await deleteCustomer(companyId,customerId);
  const orphanCount=await CustomsMasterDataModel.countDocuments({companyId,customerId});
  assert.equal(orphanCount,0);
  customerId=undefined; createdIds.length=0;

  console.log(JSON.stringify({
   event:"customs-master-data.integrity.regression.passed",
   hsKeyNormalization:"8536.20.90.00.19 -> 853620900019",
   invalidHsRejected:true,
   foreignOrMissingCustomerRejected:true,
   customerScopedLookup:true,
   customerDeleteCascade:true,
   orphanMasterDataCount:0
  },null,2));
 }finally{
  if(createdIds.length)await CustomsMasterDataModel.deleteMany({_id:{$in:createdIds}});
  if(customerId)await CustomerModel.deleteOne({_id:customerId,companyId});
  await mongoose.disconnect();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
