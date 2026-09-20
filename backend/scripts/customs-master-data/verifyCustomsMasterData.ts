import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { CustomsMasterDataModel } from "../../src/modules/customs-master-data/customsMasterData.model.js";
import { overlayHumanSupplements, resolveCustomsMasterData } from "../../src/modules/customs-master-data/customsMasterData.service.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";
async function main(){
 await mongoose.connect(env.mongoUri);const declaration:any=await DeclarationModel.findById("6aad3237ca6e4f9c2d1554f5").lean();assert(declaration?.companyId&&declaration?.normalizedData);
 const companyId=declaration.companyId,normalized=declaration.normalizedData as NormalizedDeclaration,first=normalized.goodsLines[0]!;assert(first.productCode&&first.hsCode);
 const customerId="__foundation_5_6_test__",ids:any[]=[];
 try{
  const docs=await CustomsMasterDataModel.create([
   {companyId,scope:"HS",key:first.hsCode,values:{brand:"HS-COMPANY",exemptionCode:"MUAF-HS"}},
   {companyId,customerId,scope:"HS",key:first.hsCode,values:{brand:"HS-CUSTOMER"}},
   {companyId,scope:"PRODUCT",key:first.productCode,values:{brand:"PRODUCT-COMPANY",utsNo:"UTS-1"}},
   {companyId,customerId,scope:"PRODUCT",key:first.productCode,values:{brand:"PRODUCT-CUSTOMER",usedFlag:"H"}},
   {companyId,scope:"DECLARATION_DEFAULT",key:"DEFAULT",values:{regimeCode:"1000",customsOffice:"060100"}},
   {companyId,customerId,scope:"DECLARATION_DEFAULT",key:"DEFAULT",values:{customsOffice:"060200"}}
  ]);ids.push(...docs.map(x=>x._id));
  const resolved=await resolveCustomsMasterData(companyId,customerId,normalized),line=resolved.supplements.lines?.[`line:${first.lineNo}`];
  assert.equal(line?.brand,"PRODUCT-CUSTOMER");assert.equal(line?.exemptionCode,"MUAF-HS");assert.equal(line?.utsNo,"UTS-1");assert.equal(line?.usedFlag,"H");
  assert.equal(resolved.supplements.regimeCode,"1000");assert.equal(resolved.supplements.customsOffice,"060200");
  const final=overlayHumanSupplements(resolved.supplements,{customsOffice:"HUMAN-OFFICE",lines:{[`line:${first.lineNo}`]:{brand:"HUMAN-BRAND"}}});
  assert.equal(final.customsOffice,"HUMAN-OFFICE");assert.equal(final.lines?.[`line:${first.lineNo}`]?.brand,"HUMAN-BRAND");assert.equal(final.lines?.[`line:${first.lineNo}`]?.utsNo,"UTS-1");
  console.log(JSON.stringify({event:"customs-master-data.regression.passed",precedence:"HUMAN > CUSTOMER_PRODUCT > COMPANY_PRODUCT > CUSTOMER_HS > COMPANY_HS",
   firstLine:{lineNo:first.lineNo,productCode:first.productCode,hsCode:first.hsCode},resolved:{brand:line?.brand,exemptionCode:line?.exemptionCode,utsNo:line?.utsNo,usedFlag:line?.usedFlag,regimeCode:resolved.supplements.regimeCode,customsOffice:resolved.supplements.customsOffice},
   humanOverlay:{brand:final.lines?.[`line:${first.lineNo}`]?.brand,customsOffice:final.customsOffice},traceEntries:Object.keys(resolved.trace).length},null,2));
 }finally{if(ids.length)await CustomsMasterDataModel.deleteMany({_id:{$in:ids}});await mongoose.disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
