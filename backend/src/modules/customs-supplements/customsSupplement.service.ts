import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import type { ExportDeclarationSupplements } from "../export-contract/exportDeclarationContract.types.js";
import { CustomsSupplementDecisionModel, type CustomsSupplementAction } from "./customsSupplement.model.js";

const DECLARATION_FIELDS=["declarationType","exportType","customsOffice","regimeCode","fileReference","declarationDate"] as const;
const LINE_FIELDS=["origin","brand","exemptionCode","permitCode","utsNo","usedFlag"] as const;
type DeclarationField=typeof DECLARATION_FIELDS[number]; type LineField=typeof LINE_FIELDS[number];

function text(v:unknown,name:string):string{if(typeof v!=="string"||!v.trim())throw new HttpError(400,`${name} gerekli.`);return v.trim();}
function parsePath(raw:unknown):{path:string;lineNo?:number;field:DeclarationField|LineField}{
 const path=text(raw,"fieldPath");
 if((DECLARATION_FIELDS as readonly string[]).includes(path))return {path,field:path as DeclarationField};
 const m=/^lines\.(\d+)\.([A-Za-z][A-Za-z0-9]*)$/.exec(path);
 if(!m)throw new HttpError(400,"Geçersiz customs supplement fieldPath.");
 const lineNo=Number(m[1]),field=m[2]!;
 if(!Number.isInteger(lineNo)||lineNo<1||!(LINE_FIELDS as readonly string[]).includes(field))throw new HttpError(400,"Geçersiz customs supplement line fieldPath.");
 return {path:`lines.${lineNo}.${field}`,lineNo,field:field as LineField};
}
async function declaration(companyId:mongoose.Types.ObjectId,id:string){
 if(!mongoose.isValidObjectId(id))throw new HttpError(400,"Geçersiz declaration id.");
 const d:any=await DeclarationModel.findOne({_id:id,companyId}).lean();
 if(!d)throw new HttpError(404,"Declaration bulunamadı.");
 return d;
}
function dto(x:any){return {id:String(x._id),declarationId:String(x.declarationId),fieldPath:x.fieldPath,action:x.action,value:x.value,actorUserId:x.actorUserId?String(x.actorUserId):undefined,actorEmail:x.actorEmail,reason:x.reason,createdAt:x.createdAt};}

export async function appendCustomsSupplementDecision(companyId:mongoose.Types.ObjectId,declarationId:string,input:any,actor:{userId?:string;email?:string}={}){
 const d=await declaration(companyId,declarationId);const parsed=parsePath(input.fieldPath);
 if(parsed.lineNo){
  const exists=(d.normalizedData?.goodsLines??[]).some((x:any)=>Number(x.lineNo)===parsed.lineNo);
  if(!exists)throw new HttpError(400,`Declaration line ${parsed.lineNo} bulunamadı.`);
 }
 const action:CustomsSupplementAction=input.action;
 if(action!=="SET"&&action!=="CLEAR")throw new HttpError(400,"action SET veya CLEAR olmalı.");
 const value=action==="SET"?text(input.value,"value"):undefined;
 const reason=input.reason===undefined?undefined:text(input.reason,"reason");
 const actorUserId=actor.userId&&mongoose.isValidObjectId(actor.userId)?new mongoose.Types.ObjectId(actor.userId):undefined;
 const row=await CustomsSupplementDecisionModel.create({companyId,declarationId:new mongoose.Types.ObjectId(declarationId),fieldPath:parsed.path,action,value,reason,actorUserId,actorEmail:actor.email});
 return dto(row);
}
export async function listCustomsSupplementDecisions(companyId:mongoose.Types.ObjectId,declarationId:string){
 await declaration(companyId,declarationId);
 return (await CustomsSupplementDecisionModel.find({companyId,declarationId}).sort({createdAt:1,_id:1}).lean()).map(dto);
}
export async function resolvePersistentCustomsSupplements(companyId:mongoose.Types.ObjectId,declarationId:string):Promise<ExportDeclarationSupplements>{
 await declaration(companyId,declarationId);
 const rows:any[]=await CustomsSupplementDecisionModel.find({companyId,declarationId}).sort({createdAt:1,_id:1}).lean();
 const latest=new Map<string,any>();for(const row of rows)latest.set(row.fieldPath,row);
 const out:ExportDeclarationSupplements={};const lines:NonNullable<ExportDeclarationSupplements["lines"]>={};
 for(const [path,row] of latest){
  if(row.action==="CLEAR")continue;
  const parsed=parsePath(path);
  if(parsed.lineNo){const key=`line:${parsed.lineNo}`;lines[key]={...(lines[key]??{}),[parsed.field]:row.value};}
  else (out as any)[parsed.field]=row.value;
 }
 if(Object.keys(lines).length)out.lines=lines;return out;
}
