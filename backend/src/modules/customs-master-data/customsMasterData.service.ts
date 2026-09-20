import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import type { ExportDeclarationSupplements, ExportLineSupplement } from "../export-contract/exportDeclarationContract.types.js";
import { CUSTOMS_MASTER_SCOPES, CustomsMasterDataModel, type CustomsMasterDataDoc, type CustomsMasterScope } from "./customsMasterData.model.js";

export interface MasterDataTraceEntry { source:"MASTER_DATA"; masterDataId:string; scope:"DECLARATION_DEFAULT"|"PRODUCT"|"HS"; key:string; customerId?:string; }
export interface ResolvedCustomsMasterData { supplements:ExportDeclarationSupplements; trace:Record<string,MasterDataTraceEntry>; }
function clean(v:unknown):string|undefined{return typeof v==="string"&&v.trim()?v.trim():undefined;}
function lineValues(r:CustomsMasterDataDoc):ExportLineSupplement{return {brand:clean(r.values.brand),exemptionCode:clean(r.values.exemptionCode),
  permitCode:clean(r.values.permitCode),utsNo:clean(r.values.utsNo),usedFlag:clean(r.values.usedFlag)};}
function mergeDefined<T extends object>(base:T,extra:Partial<T>):T{const out:any={...base};for(const [k,v] of Object.entries(extra))if(v!==undefined&&v!==null&&v!=="")out[k]=v;return out;}
function specificity(r:CustomsMasterDataDoc,customerId?:string):number{return r.customerId&&customerId&&r.customerId===customerId?2:r.customerId?0:1;}

/** Customs enrichment is authoritative master data, not invoice IDP. */

const DECLARATION_FIELDS=["declarationType","exportType","customsOffice","regimeCode"] as const;
const LINE_FIELDS=["brand","exemptionCode","permitCode","utsNo","usedFlag"] as const;
const ALL_VALUE_FIELDS=[...DECLARATION_FIELDS,...LINE_FIELDS] as const;
function requiredText(v:unknown,n:string):string{if(typeof v!=="string"||!v.trim())throw new HttpError(400,`${n} gerekli.`);return v.trim();}
function optionalText(v:unknown,n:string):string|undefined{if(v===undefined||v===null||v==="")return undefined;if(typeof v!=="string")throw new HttpError(400,`${n} metin olmalı.`);return v.trim()||undefined;}
function assertScope(v:unknown):CustomsMasterScope{if(typeof v!=="string"||!CUSTOMS_MASTER_SCOPES.includes(v as CustomsMasterScope))throw new HttpError(400,"Geçersiz master data scope.");return v as CustomsMasterScope;}
function validatedValues(scope:CustomsMasterScope,input:unknown):CustomsMasterDataDoc["values"]{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new HttpError(400,"values nesnesi gerekli.");
 const body=input as Record<string,unknown>,out:Record<string,string>={};
 for(const key of Object.keys(body)){if(!ALL_VALUE_FIELDS.includes(key as any))throw new HttpError(400,`Desteklenmeyen master data alanı: ${key}`);const v=optionalText(body[key],key);if(v)out[key]=v;}
 const allowed:readonly string[]=scope==="DECLARATION_DEFAULT"?DECLARATION_FIELDS:LINE_FIELDS;
 for(const key of Object.keys(out))if(!allowed.includes(key))throw new HttpError(400,`${key} alanı ${scope} scope'u için geçerli değil.`);
 if(!Object.keys(out).length)throw new HttpError(400,"En az bir master data değeri gerekli.");return out;
}
function dto(row:any){return {id:String(row._id),customerId:row.customerId,scope:row.scope,key:row.key,values:row.values,active:row.active,createdAt:row.createdAt,updatedAt:row.updatedAt};}
export async function listCustomsMasterData(companyId:mongoose.Types.ObjectId,filter:{customerId?:string;scope?:string;key?:string}={}){
 const q:any={companyId};if(filter.customerId!==undefined)q.customerId=filter.customerId.trim()||undefined;if(filter.scope!==undefined)q.scope=assertScope(filter.scope);if(filter.key!==undefined)q.key=filter.key.trim();
 return (await CustomsMasterDataModel.find(q).sort({scope:1,key:1,customerId:1,updatedAt:-1})).map(dto);
}
export async function createCustomsMasterData(companyId:mongoose.Types.ObjectId,body:any){
 const scope=assertScope(body.scope),key=requiredText(body.key,"key");if(scope==="DECLARATION_DEFAULT"&&key!=="DEFAULT")throw new HttpError(400,"DECLARATION_DEFAULT key değeri DEFAULT olmalı.");
 const customerId=optionalText(body.customerId,"customerId"),values=validatedValues(scope,body.values);
 try{return dto(await CustomsMasterDataModel.create({companyId,customerId,scope,key,values,active:body.active!==false}));}catch(e:any){if(e?.code===11000)throw new HttpError(409,"Aynı tenant/customer/scope/key için master data zaten mevcut.");throw e;}
}
export async function updateCustomsMasterData(companyId:mongoose.Types.ObjectId,id:string,body:any){
 if(!mongoose.isValidObjectId(id))throw new HttpError(400,"Geçersiz master data id.");const current=await CustomsMasterDataModel.findOne({_id:id,companyId});if(!current)throw new HttpError(404,"Master data kaydı bulunamadı.");
 const update:any={};if(body.values!==undefined)update.values=validatedValues(current.scope,body.values);if(body.active!==undefined){if(typeof body.active!=="boolean")throw new HttpError(400,"active boolean olmalı.");update.active=body.active;}
 if(!Object.keys(update).length)throw new HttpError(400,"Güncellenecek alan yok.");const row=await CustomsMasterDataModel.findOneAndUpdate({_id:id,companyId},{$set:update},{new:true,runValidators:true});if(!row)throw new HttpError(404,"Master data kaydı bulunamadı.");return dto(row);
}
export async function deleteCustomsMasterData(companyId:mongoose.Types.ObjectId,id:string):Promise<void>{if(!mongoose.isValidObjectId(id))throw new HttpError(400,"Geçersiz master data id.");if(!await CustomsMasterDataModel.findOneAndDelete({_id:id,companyId}))throw new HttpError(404,"Master data kaydı bulunamadı.");}

export async function resolveCustomsMasterData(companyId:mongoose.Types.ObjectId,customerId:string|undefined,normalized:NormalizedDeclaration):Promise<ResolvedCustomsMasterData>{
 const rows=await CustomsMasterDataModel.find({companyId,active:true,$or:[{customerId:{$exists:false}},{customerId:null},...(customerId?[{customerId}]:[])]}).lean() as unknown as CustomsMasterDataDoc[];
 const supplements:ExportDeclarationSupplements={lines:{}}; const trace:Record<string,MasterDataTraceEntry>={};
 const defaults=rows.filter(r=>r.scope==="DECLARATION_DEFAULT"&&r.key==="DEFAULT").sort((a,b)=>specificity(a,customerId)-specificity(b,customerId));
 for(const row of defaults)for(const field of ["declarationType","exportType","customsOffice","regimeCode"] as const){const value=clean(row.values[field]);if(!value)continue;(supplements as any)[field]=value;trace[`customs.${field}`]={source:"MASTER_DATA",masterDataId:String(row._id),scope:row.scope,key:row.key,customerId:row.customerId};}
 for(const line of normalized.goodsLines){
  const k=`line:${line.lineNo}`;let effective:ExportLineSupplement={};const applied:CustomsMasterDataDoc[]=[];
  const hs=rows.filter(r=>r.scope==="HS"&&r.key===line.hsCode).sort((a,b)=>specificity(a,customerId)-specificity(b,customerId));
  const product=rows.filter(r=>r.scope==="PRODUCT"&&r.key===line.productCode).sort((a,b)=>specificity(a,customerId)-specificity(b,customerId));
  for(const row of [...hs,...product]){effective=mergeDefined(effective,lineValues(row));applied.push(row);}
  if(Object.values(effective).some(v=>v!==undefined))supplements.lines![k]=effective;
  for(const field of ["brand","exemptionCode","permitCode","utsNo","usedFlag"] as const){if(!effective[field])continue;const owner=[...applied].reverse().find(r=>lineValues(r)[field]===effective[field]);if(owner)trace[`lines.${line.lineNo}.${field}`]={source:"MASTER_DATA",masterDataId:String(owner._id),scope:owner.scope,key:owner.key,customerId:owner.customerId};}
 }
 if(!Object.keys(supplements.lines!).length)delete supplements.lines;return {supplements,trace};
}
export function overlayHumanSupplements(master:ExportDeclarationSupplements,human:ExportDeclarationSupplements={}):ExportDeclarationSupplements{
 const lines={...(master.lines??{})};for(const [k,v] of Object.entries(human.lines??{}))lines[k]=mergeDefined(lines[k]??{},v);
 return {...master,...human,lines:Object.keys(lines).length?lines:undefined};
}
