import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { LogicalDocumentModel } from "../../src/modules/idp/domain/logicalDocument.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { ProcessingStatus } from "../../src/modules/idp/domain/idp.types.js";
import type { InvoiceLlmExtractionArtifact } from "../../src/modules/idp/domain/invoiceLlmExtraction.types.js";
import { enqueueDocumentProcessing } from "../../src/modules/idp/queue/idpProcessing.service.js";
import { closeIdpQueue, getIdpQueue } from "../../src/modules/idp/queue/idpQueue.js";
import { normalizeInvoiceVisionCheckpoint } from "../../src/modules/idp/llm/invoiceVisionCheckpoint.js";
import { normalizeModelExtractionArtifacts } from "../../src/modules/idp/domain/modelExtractionArtifactPersistence.js";
import { PRODUCT_E2E_GENERALIZATION_CASES as CASES, PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT as ROOT } from "./productE2EGeneralizationGroundTruth.js";

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const norm=(v:unknown)=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/İ/g,"I").toUpperCase().replace(/\s+/g," ").trim();
const code=(v:unknown)=>String(v??"").replace(/\D/g,"");
const numberOf=(v:unknown)=>typeof v==="number"?v:Number(String(v??"").replace(/\s/g,"").replace(/,/g,"."));
const eqNum=(a:unknown,e:number)=>Number.isFinite(numberOf(a))&&Math.abs(numberOf(a)-e)<=Math.max(1e-6,Math.abs(e)*1e-6);
const iso=(v:unknown)=>{if(!v)return ""; const d=v instanceof Date?v:new Date(String(v)); return Number.isNaN(d.getTime())?String(v):d.toISOString().slice(0,10);};

function artifactsOf(run:any):InvoiceLlmExtractionArtifact[]{
  const firstClass = normalizeModelExtractionArtifacts(run?.modelExtractionArtifacts);
  if (firstClass.length > 0) return [...firstClass].sort((a,b)=>(a.pageNumbers[0]??0)-(b.pageNumbers[0]??0));
  // Compatibility read for runs created before 1.6.8.1. New production runs must
  // persist the dedicated first-class field above.
  const cp=normalizeInvoiceVisionCheckpoint(run?.visionCandidateCheckpoint); const out:InvoiceLlmExtractionArtifact[]=[];
  for(const segment of Object.values(cp.segments)) for(const page of Object.values(segment.pages)) if(page.extractionArtifact) out.push(page.extractionArtifact);
  return out.sort((a,b)=>(a.pageNumbers[0]??0)-(b.pageNumbers[0]??0));
}
function semanticOf(artifacts:InvoiceLlmExtractionArtifact[]){
  const scalar:Record<string,unknown>={}; const goods:Record<string,unknown[]>={};
  for(const artifact of artifacts) for(const f of artifact.parsedSemanticResponse.fields){
    if(f.field.startsWith("goodsLines[].")){ const k=f.field.slice("goodsLines[].".length); if(!goods[k])goods[k]=[]; if(Array.isArray(f.value)) goods[k].push(...f.value); }
    else if(scalar[f.field]===undefined||scalar[f.field]===null||scalar[f.field]==="") scalar[f.field]=f.value;
  }
  const n=Math.max(0,...Object.values(goods).map(x=>x.length));
  return {scalar,goodsLines:Array.from({length:n},(_,i)=>Object.fromEntries(Object.entries(goods).map(([k,v])=>[k,v[i]])))};
}
function finalScalar(nd:any,k:string){
  if(k==="invoiceNumber")return nd?.header?.invoiceNo; if(k==="invoiceDate")return nd?.header?.invoiceDate; if(k==="currency")return nd?.header?.currency;
  if(k==="deliveryTerm")return nd?.trade?.deliveryTerm; if(k==="grossWeight")return nd?.packageInfo?.grossKg; if(k==="netWeight")return nd?.packageInfo?.netKg; if(k==="originCountry")return nd?.trade?.origin;
}
function semanticScalar(s:any,k:string){if(k==="originCountry")return s.scalar.origin; if(k==="grossWeight")return s.scalar.grossKg; if(k==="netWeight")return s.scalar.netKg; return s.scalar[k];}
function scalarPass(k:string,a:unknown,e:unknown){if(k==="invoiceDate")return iso(a)===String(e); if(k==="grossWeight"||k==="netWeight")return eqNum(a,Number(e)); if(k==="originCountry")return norm(a)===norm(e); return norm(a)===norm(e);}
function goodsScore(expected:any[], actual:any[]){
  const checks:any[]=[]; const used=new Set<number>();
  for(let ei=0;ei<expected.length;ei++){
    const e=expected[ei]; let best=-1,bestPoints=-1;
    for(let ai=0;ai<actual.length;ai++){if(used.has(ai))continue; const a=actual[ai]??{}; let p=0;
      if(e.descriptionContains!==undefined&&norm(a.description).includes(norm(e.descriptionContains)))p+=4;
      if(e.hsCode!==undefined&&code(a.hsCode)===code(e.hsCode))p+=3;
      if(e.quantity!==undefined&&eqNum(a.quantity,e.quantity))p+=2; if(e.lineTotal!==undefined&&eqNum(a.lineTotal,e.lineTotal))p+=2; if(e.unitPrice!==undefined&&eqNum(a.unitPrice,e.unitPrice))p+=1;
      if(p>bestPoints){bestPoints=p;best=ai;}}
    const a=best>=0?actual[best]:{}; if(best>=0)used.add(best);
    const add=(f:string,ex:unknown,ac:unknown,pass:boolean)=>checks.push({field:`goodsLines[${ei}].${f}`,expected:ex,actual:ac,passed:pass,matchedActualIndex:best});
    if(e.descriptionContains!==undefined)add("description",`contains ${e.descriptionContains}`,a?.description,norm(a?.description).includes(norm(e.descriptionContains)));
    if(e.hsCode!==undefined)add("hsCode",e.hsCode,a?.hsCode,code(a?.hsCode)===code(e.hsCode));
    if(e.quantity!==undefined)add("quantity",e.quantity,a?.quantity,eqNum(a?.quantity,e.quantity)); if(e.unit!==undefined)add("unit",e.unit,a?.unit,norm(a?.unit)===norm(e.unit));
    if(e.unitPrice!==undefined)add("unitPrice",e.unitPrice,a?.unitPrice,eqNum(a?.unitPrice,e.unitPrice)); if(e.lineTotal!==undefined)add("lineTotal",e.lineTotal,a?.lineTotal,eqNum(a?.lineTotal,e.lineTotal));
  } return checks;
}
function score(tc:any, semantic:any, final:any){
  const scalarKeys=["invoiceNumber","currency","deliveryTerm","invoiceDate","grossWeight","netWeight","originCountry"];
  const sem:any[]=[], fin:any[]=[];
  for(const k of scalarKeys){const e=tc.expected?.[k]; if(e===undefined)continue; const sa=semanticScalar(semantic,k),fa=finalScalar(final,k); sem.push({field:k,expected:e,actual:sa,passed:scalarPass(k,sa,e)}); fin.push({field:k,expected:e,actual:fa,passed:scalarPass(k,fa,e)});}
  sem.push(...goodsScore(tc.expected?.goodsLines??[],semantic.goodsLines)); fin.push(...goodsScore(tc.expected?.goodsLines??[],final?.goodsLines??[]));
  return {semantic:sem,final:fin};
}
async function waitTerminal(runId:string,id:string,timeout=120*60_000){const end=Date.now()+timeout;let last="";while(Date.now()<end){const run:any=await ProcessingRunModel.findById(runId).lean();assert(run,`${id}: run disappeared`);const job=await getIdpQueue().getJob(runId);assert(job,`${id}: job disappeared`);const state=await job.getState();const snap=`${run.status}/${run.currentStage}/${state}/attempt=${run.attempt}`;if(snap!==last){console.log(JSON.stringify({event:"product-e2e-1.6.8.case.progress",id,state:snap}));last=snap;}if(run.status===ProcessingStatus.FAILED||state==="failed")throw new Error(`${id}: worker failed: ${JSON.stringify(run.error)}`);if((run.status===ProcessingStatus.COMPLETED||run.status===ProcessingStatus.REVIEW_REQUIRED)&&state==="completed")return run;await sleep(500);}throw new Error(`${id}: timeout`);}
async function main(){
  assert.equal(env.llmEnabled,true,"1.6.8 requires LLM_ENABLED=true"); assert.equal(env.llmVisionEnabled,true,"1.6.8 requires LLM_VISION_ENABLED=true");
  const defaults=["volta-vxa-0035","ningbo-wyl-2026060501","mekar-ear-0068"]; const requested=(process.env.GENERALIZATION_CASES??defaults.join(",")).split(",").map(x=>x.trim()).filter(Boolean); const selected=CASES.filter((x:any)=>requested.includes(x.id)); assert.equal(selected.length,requested.length,`Unknown GENERALIZATION_CASES=${requested.join(",")}`);
  await mongoose.connect(env.mongoUri); const reports:any[]=[];
  try{for(const tc of selected as any[]){const pdfPath=path.join(ROOT,tc.pdf);const bytes=await fs.readFile(pdfPath);assert.equal(createHash("sha256").update(bytes).digest("hex"),tc.sourceSha256,`${tc.id}: frozen source changed`);const companyId=new mongoose.Types.ObjectId(),declarationId=new mongoose.Types.ObjectId();let uploadedId:any,runId="";
    try{await DeclarationModel.create({_id:declarationId,companyId,status:"DRAFT",normalizedData:{}});const stat=await fs.stat(pdfPath);const up:any=await UploadedFileModel.create({companyId,declarationId,type:DocumentType.INVOICE,fileName:tc.pdf,filePath:pdfPath,mimeType:"application/pdf",size:stat.size,extractionStatus:"PENDING",parseErrors:[]});uploadedId=up._id;const queued:any=await enqueueDocumentProcessing({companyId,declarationId:String(declarationId),uploadedFileId:String(uploadedId)});runId=String(queued._id);const terminal:any=await waitTerminal(runId,tc.id);const run:any=await ProcessingRunModel.findById(runId).lean();const declaration:any=await DeclarationModel.findById(declarationId).lean();const artifacts=artifactsOf(run);assert.ok(artifacts.length>0,`${tc.id}: no persisted Qwen extraction artifact`);const semantic=semanticOf(artifacts);const scored=score(tc,semantic,declaration?.normalizedData??{});const sp=scored.semantic.filter((x:any)=>x.passed).length,fp=scored.final.filter((x:any)=>x.passed).length;const report={id:tc.id,mode:tc.mode,workerOutcome:terminal.status,artifactPages:artifacts.flatMap(a=>a.pageNumbers),model:[...new Set(artifacts.map(a=>a.model))],semantic:{passed:sp,total:scored.semantic.length,percent:scored.semantic.length?Number((100*sp/scored.semantic.length).toFixed(1)):100},final:{passed:fp,total:scored.final.length,percent:scored.final.length?Number((100*fp/scored.final.length).toFixed(1)):100},downstreamDelta:fp-sp,semanticChecks:scored.semantic,finalChecks:scored.final};reports.push(report);console.log(JSON.stringify({event:"product-e2e-1.6.8.case.measured",...report},null,2));}
    finally{if(runId){const job=await getIdpQueue().getJob(runId);if(job)try{await job.remove();}catch{}}await DeclarationFieldResolutionRunModel.deleteMany({declarationId});await LogicalDocumentModel.deleteMany({declarationId});if(runId)await ProcessingRunModel.deleteMany({_id:runId});if(uploadedId)await UploadedFileModel.deleteMany({_id:uploadedId});await DeclarationModel.deleteMany({_id:declarationId});}}
    const semP=reports.reduce((s,r)=>s+r.semantic.passed,0),semT=reports.reduce((s,r)=>s+r.semantic.total,0),finP=reports.reduce((s,r)=>s+r.final.passed,0),finT=reports.reduce((s,r)=>s+r.final.total,0);
    console.log(JSON.stringify({event:"product-e2e-1.6.8.llm-first-real-holdout-stage-accuracy.measured",cases:reports.length,semantic:{passed:semP,total:semT,percent:semT?Number((100*semP/semT).toFixed(1)):100},final:{passed:finP,total:finT,percent:finT?Number((100*finP/finT).toFixed(1)):100},guardrails:{frozenGroundTruth:true,realProductionQueue:true,realConfiguredVisionProvider:true,persistedModelArtifactRequired:true,secondGroundTruthAwareModelCall:false,measurementOnly:true,supplierSpecificRules:false,directNormalizedWrite:false}},null,2));
  }finally{await closeIdpQueue();await mongoose.disconnect();}}
main().catch(async e=>{console.error(e);try{await closeIdpQueue();}catch{}try{await mongoose.disconnect();}catch{}process.exitCode=1;});
