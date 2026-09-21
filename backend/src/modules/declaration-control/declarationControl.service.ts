import mongoose from "mongoose";
import { HttpError } from "../../common/middlewares/errorHandler.js";
import { DeclarationModel } from "../declarations/declaration.model.js";
import { ProcessingRunModel } from "../idp/domain/processingRun.model.js";
import { discoverInvoiceOriginFieldCandidates } from "../idp/candidates/invoiceOriginCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { buildExportDeclarationContract } from "../export-contract/exportDeclarationContract.service.js";
import type { ExportDeclarationSupplements } from "../export-contract/exportDeclarationContract.types.js";
import type { NormalizedDeclaration } from "../normalization/normalizedDeclaration.types.js";
import { overlayHumanSupplements, resolveCustomsMasterData } from "../customs-master-data/customsMasterData.service.js";
import { listCustomsSupplementDecisions, resolvePersistentCustomsSupplements } from "../customs-supplements/customsSupplement.service.js";

export type ControlAuthority = "NORMALIZED_DECLARATION" | "MASTER_DATA" | "PERSISTENT_HUMAN";

export interface ControlEvidence {
  uploadedFileId:string; processingRunId:string; pageNumber:number;
  bbox?:{x0:number;y0:number;x1:number;y1:number}; text?:string;
  contentSource?:"NATIVE_TEXT"|"OCR"|"DERIVED"; candidateId?:string; extractor?:string;
}
export interface ControlProvenanceEntry {
  path:string; value:unknown; authority:ControlAuthority; label:string;
  masterData?:{masterDataId:string;scope:string;key:string;customerId?:string};
  human?:{decisionId:string;actorEmail?:string;reason?:string;createdAt?:Date};
  evidence?:ControlEvidence;
}
export interface DeclarationControlProjection {
  declarationId:string; contract:ReturnType<typeof buildExportDeclarationContract>;
  entries:ControlProvenanceEntry[];
}

const LABELS:Record<string,string>={
 "invoice.invoiceNo":"Fatura No","invoice.invoiceDate":"Fatura Tarihi","invoice.currency":"Döviz","invoice.totalAmount":"Fatura Toplamı",
 "package.totalPackage":"Toplam Kap","package.packageType":"Kap Cinsi","package.grossKg":"Brüt KG","package.netKg":"Net KG",
 "customs.declarationType":"Beyan Tipi","customs.exportType":"İhracat Tipi","customs.customsOffice":"Gümrük İdaresi",
 "customs.regimeCode":"Rejim Kodu","customs.fileReference":"Dosya Referansı","customs.declarationDate":"Beyanname Tarihi",
};
const NORMALIZED_CANDIDATE_PATH:Record<string,string>={
 "invoice.invoiceNo":"header.invoiceNo","invoice.invoiceDate":"header.invoiceDate","invoice.currency":"header.currency","invoice.totalAmount":"header.totalAmount",
 "package.totalPackage":"packageInfo.totalPackage","package.packageType":"packageInfo.packageType","package.grossKg":"packageInfo.grossKg","package.netKg":"packageInfo.netKg",
};
function valueAt(obj:any,path:string):unknown{return path.split(".").reduce((v,k)=>v==null?undefined:v[k],obj);}
function hasValue(v:unknown):boolean{return v!==undefined&&v!==null&&v!=="";}
function humanPathForContract(path:string):string{
 if(path.startsWith("customs."))return path.slice("customs.".length);
 const m=/^lines\.(\d+)\.(.+)$/.exec(path);return m?`lines.${m[1]}.${m[2]}`:path;
}
function candidatePathForContract(path:string,normalized:NormalizedDeclaration):string|undefined{
 if(NORMALIZED_CANDIDATE_PATH[path])return NORMALIZED_CANDIDATE_PATH[path];
 const m=/^lines\.(\d+)\.(hsCode|productCode|description|quantity|unit|unitPrice|lineTotal|origin)$/.exec(path);
 if(!m)return undefined;
 const lineNo=Number(m[1]);const index=normalized.goodsLines.findIndex(x=>x.lineNo===lineNo);
 return index>=0?`goodsLines.${index}.${m[2]}`:undefined;
}
function candidateEnvelopes(run:any):any[]{
 const out:any[]=[];
 for(const segment of run?.candidates?.segments??[]){
  const audit=segment?.data?.genericCandidateAudit;if(!audit)continue;
  const segmentId=String(segment?.segmentId??"invoice");

  // Older completed runs predate persisted 5.5A enrichment envelopes.
  // Declaration normalization already reconstructs these from the persisted
  // CanonicalDocument. Provenance projection must use the same source of truth,
  // otherwise normalized values exist while their physical evidence appears lost.
  const origin=audit.originCandidates??discoverInvoiceOriginFieldCandidates(
    run.canonicalDocument as any,segmentId,audit.candidates
  );
  const shipment=audit.shipmentCandidates??discoverInvoiceShipmentFieldCandidates(
    run.canonicalDocument as any,segmentId
  );
  const headerParty=audit.headerPartyCandidates??discoverInvoiceHeaderPartyFieldCandidates(
    run.canonicalDocument as any,segmentId
  );
  const commercial=audit.commercialTermsCandidates??discoverInvoiceCommercialTermsFieldCandidates(
    run.canonicalDocument as any,segmentId
  );

  for(const envelope of [audit.candidates,headerParty,commercial,shipment,origin])
   if(envelope?.fields)out.push(envelope);
 }
 return out;
}
function findEvidence(runs:any[],candidatePath:string|undefined):ControlEvidence|undefined{
 if(!candidatePath)return undefined;
 for(const run of runs)for(const envelope of candidateEnvelopes(run))
  for(const candidates of Object.values(envelope.fields??{}) as any[][])for(const candidate of candidates??[]){
   if(candidate?.field!==candidatePath)continue;
   const ev=(candidate.evidence??[]).find((x:any)=>x?.contentSource!=="DERIVED"&&Number.isInteger(x?.pageNumber));
   if(ev)return {uploadedFileId:String(run.uploadedFileId),processingRunId:String(run._id),pageNumber:ev.pageNumber,bbox:ev.bbox,text:ev.text,
    contentSource:ev.contentSource,candidateId:candidate.candidateId,extractor:candidate.extractor};
  }
 return undefined;
}
function contractPaths(contract:any):Array<{path:string;value:unknown;label:string}>{
 const out:Array<{path:string;value:unknown;label:string}>=[];
 for(const path of Object.keys(NORMALIZED_CANDIDATE_PATH))out.push({path,value:valueAt(contract,path),label:LABELS[path]??path});
 for(const field of ["declarationType","exportType","customsOffice","regimeCode","fileReference","declarationDate"])
  out.push({path:`customs.${field}`,value:contract.customs?.[field],label:LABELS[`customs.${field}`]??field});
 for(const line of contract.lines??[])for(const field of ["hsCode","productCode","description","quantity","unit","unitPrice","lineTotal","origin","brand","exemptionCode","permitCode","utsNo","usedFlag"])
  out.push({path:`lines.${line.lineNo}.${field}`,value:line[field],label:`Kalem ${line.lineNo} · ${field}`});
 return out.filter(x=>hasValue(x.value));
}

export async function getDeclarationControlProjection(companyId:mongoose.Types.ObjectId,declarationId:string):Promise<DeclarationControlProjection>{
 if(!mongoose.isValidObjectId(declarationId))throw new HttpError(400,"Geçersiz beyanname id.");
 const declaration:any=await DeclarationModel.findOne({_id:declarationId,companyId}).lean();
 if(!declaration)throw new HttpError(404,"Beyanname bulunamadı.");
 if(!declaration.normalizedData)throw new HttpError(409,"Beyanname henüz normalize edilmemiş.");
 const normalized=declaration.normalizedData as NormalizedDeclaration;
 const master=await resolveCustomsMasterData(companyId,declaration.operation?.customerId,normalized);
 const persistent=await resolvePersistentCustomsSupplements(companyId,declarationId);
 const effective=overlayHumanSupplements(master.supplements,persistent);
 const contract=buildExportDeclarationContract(normalized,effective);
 const decisions=await listCustomsSupplementDecisions(companyId,declarationId);
 const latestHuman=new Map<string,any>();for(const x of decisions)latestHuman.set(x.fieldPath,x);
 const runs:any[]=await ProcessingRunModel.find({companyId,declarationId,status:"COMPLETED"}).sort({createdAt:-1}).lean();

 const entries=contractPaths(contract).map(({path,value,label})=>{
  const hp=humanPathForContract(path),human=latestHuman.get(hp);
  if(human?.action==="SET")return {path,value,label,authority:"PERSISTENT_HUMAN" as const,human:{decisionId:human.id,actorEmail:human.actorEmail,reason:human.reason,createdAt:human.createdAt}};
  const mt=master.trace[path];
  if(mt)return {path,value,label,authority:"MASTER_DATA" as const,masterData:{masterDataId:mt.masterDataId,scope:mt.scope,key:mt.key,customerId:mt.customerId}};
  return {path,value,label,authority:"NORMALIZED_DECLARATION" as const,evidence:findEvidence(runs,candidatePathForContract(path,normalized))};
 });
 return {declarationId,contract,entries};
}
