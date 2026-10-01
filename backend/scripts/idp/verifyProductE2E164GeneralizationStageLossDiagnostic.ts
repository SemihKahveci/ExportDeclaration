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
import { enqueueDocumentProcessing } from "../../src/modules/idp/queue/idpProcessing.service.js";
import { closeIdpQueue, getIdpQueue } from "../../src/modules/idp/queue/idpQueue.js";
import { PRODUCT_E2E_GENERALIZATION_CASES as CASES, PRODUCT_E2E_GENERALIZATION_CORPUS_ROOT as ROOT } from "./productE2EGeneralizationGroundTruth.js";

const sleep = (ms:number) => new Promise((r)=>setTimeout(r,ms));
const norm = (v:unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const compact = (v:unknown) => norm(v).replace(/[^A-Z0-9.]/g,"");
const rawFieldPattern = /(raw.*(model|llm|vision)|(?:model|llm|vision).*raw|provider.*response|response.*provider)/i;

function flattenExpected(tc:any) {
  const out:{field:string,value:unknown}[]=[];
  for (const [k,v] of Object.entries(tc.expected ?? {})) {
    if (k === "goodsLines" || v === undefined) continue;
    out.push({field:k,value:v});
  }
  for (let i=0;i<(tc.expected?.goodsLines ?? []).length;i++) {
    const line=tc.expected.goodsLines[i];
    for (const [k,v] of Object.entries(line)) if (v !== undefined) out.push({field:`goodsLines[${i}].${k}`,value:v});
  }
  return out;
}

function containsValue(obj:unknown, expected:unknown):boolean {
  if (obj === null || obj === undefined) return false;
  const target=compact(expected);
  if (!target) return false;
  const walk=(v:any):boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string" || typeof v === "number") {
      const c=compact(v);
      return c === target || (target.length >= 5 && c.includes(target)) || (c.length >= 5 && target.includes(c));
    }
    if (Array.isArray(v)) return v.some(walk);
    if (typeof v === "object") return Object.values(v).some(walk);
    return false;
  };
  return walk(obj);
}

function rawResponsePaths(obj:any, prefix=""):string[] {
  if (!obj || typeof obj !== "object") return [];
  const found:string[]=[];
  for (const [k,v] of Object.entries(obj)) {
    const p=prefix ? `${prefix}.${k}` : k;
    if (rawFieldPattern.test(k)) found.push(p);
    if (v && typeof v === "object" && found.length < 50) found.push(...rawResponsePaths(v,p));
  }
  return [...new Set(found)].slice(0,50);
}

function readFinal(nd:any, field:string):unknown {
  if (field==="invoiceNumber") return nd?.header?.invoiceNo;
  if (field==="currency") return nd?.header?.currency;
  if (field==="deliveryTerm") return nd?.trade?.deliveryTerm;
  if (field==="invoiceDate") return nd?.header?.invoiceDate;
  if (field==="grossWeight") return nd?.packageInfo?.grossKg;
  if (field==="netWeight") return nd?.packageInfo?.netKg;
  if (field==="originCountry") return nd?.trade?.origin;
  const m=/^goodsLines\[(\d+)\]\.(.+)$/.exec(field);
  return m ? nd?.goodsLines?.[Number(m[1])]?.[m[2]] : undefined;
}

async function waitTerminal(runId:string,id:string,timeout=120*60_000) {
  const deadline=Date.now()+timeout; let last="";
  while(Date.now()<deadline) {
    const run:any=await ProcessingRunModel.findById(runId).lean(); assert(run,`${id}: run disappeared`);
    const job=await getIdpQueue().getJob(runId); assert(job,`${id}: job disappeared`);
    const state=await job.getState(); const snap=`${run.status}/${run.currentStage}/${state}/attempt=${run.attempt}`;
    if(snap!==last){ console.log(JSON.stringify({event:"product-e2e-1.6.4.case.progress",id,state:snap})); last=snap; }
    if(run.status===ProcessingStatus.FAILED || state==="failed") throw new Error(`${id}: worker failed: ${JSON.stringify(run.error)}`);
    if((run.status===ProcessingStatus.COMPLETED || run.status===ProcessingStatus.REVIEW_REQUIRED) && state==="completed") return run;
    await sleep(500);
  }
  throw new Error(`${id}: timeout`);
}

async function main(){
  assert.equal(env.llmEnabled,true,"1.6.4 requires LLM_ENABLED=true");
  assert.equal(env.llmVisionEnabled,true,"1.6.4 requires LLM_VISION_ENABLED=true");
  const defaults=["volta-vxa-0035","ningbo-wyl-2026060501","mekar-ear-0068"];
  const requested=(process.env.GENERALIZATION_CASES ?? defaults.join(",")).split(",").map(x=>x.trim()).filter(Boolean);
  const selected=CASES.filter((x:any)=>requested.includes(x.id));
  assert.equal(selected.length,requested.length,`Unknown GENERALIZATION_CASES=${requested.join(",")}`);
  await mongoose.connect(env.mongoUri);
  const reports:any[]=[];
  try {
    for(const tc of selected as any[]){
      const pdfPath=path.join(ROOT,tc.pdf); const bytes=await fs.readFile(pdfPath);
      assert.equal(createHash("sha256").update(bytes).digest("hex"),tc.sourceSha256,`${tc.id}: frozen source changed`);
      const companyId=new mongoose.Types.ObjectId(), declarationId=new mongoose.Types.ObjectId();
      let uploadedId:any, runId="";
      try {
        await DeclarationModel.create({_id:declarationId,companyId,status:"DRAFT",normalizedData:{}});
        const stat=await fs.stat(pdfPath);
        const up:any=await UploadedFileModel.create({companyId,declarationId,type:DocumentType.INVOICE,fileName:tc.pdf,filePath:pdfPath,mimeType:"application/pdf",size:stat.size,extractionStatus:"PENDING",parseErrors:[]}); uploadedId=up._id;
        const queued:any=await enqueueDocumentProcessing({companyId,declarationId:String(declarationId),uploadedFileId:String(uploadedId)}); runId=String(queued._id);
        const terminal:any=await waitTerminal(runId,tc.id);
        const declaration:any=await DeclarationModel.findById(declarationId).lean();
        const audits:any[]=await DeclarationFieldResolutionRunModel.find({companyId,declarationId}).lean();
        const run:any=await ProcessingRunModel.findById(runId).lean();
        const runRawPaths=rawResponsePaths(run); const auditRawPaths=rawResponsePaths(audits);
        const expected=flattenExpected(tc);
        const fields=expected.map(({field,value})=>{
          const inRun=containsValue(run,value), inAudit=containsValue(audits,value), final=readFinal(declaration?.normalizedData ?? {},field), inFinal=containsValue(final,value);
          let boundary="SOURCE_OR_MODEL_NOT_PERSISTED";
          if(inFinal) boundary="FINAL_PRESENT";
          else if(inAudit) boundary="RESOLUTION_OR_PROMOTION_LOSS";
          else if(inRun) boundary="CANDIDATE_OR_RESOLUTION_LOSS";
          return {field,expected:value,persistedRunEvidence:inRun,persistedResolutionEvidence:inAudit,finalValue:final,finalEquivalent:inFinal,lossBoundary:boundary};
        });
        const counts=fields.reduce((a:any,f:any)=>(a[f.lossBoundary]=(a[f.lossBoundary]??0)+1,a),{});
        const report={id:tc.id,mode:tc.mode,workerOutcome:terminal.status,fields,lossBoundaryCounts:counts,observability:{rawModelResponseLikePaths:[...runRawPaths,...auditRawPaths].slice(0,50),rawModelResponsePersisted:runRawPaths.length+auditRawPaths.length>0,rawModelCorrectnessDirectlyMeasurable:runRawPaths.length+auditRawPaths.length>0}};
        reports.push(report); console.log(JSON.stringify({event:"product-e2e-1.6.4.case.diagnosed",...report},null,2));
      } finally {
        if(runId){const job=await getIdpQueue().getJob(runId); if(job) try{await job.remove();}catch{}}
        await DeclarationFieldResolutionRunModel.deleteMany({declarationId}); await LogicalDocumentModel.deleteMany({declarationId});
        if(runId) await ProcessingRunModel.deleteMany({_id:runId}); if(uploadedId) await UploadedFileModel.deleteMany({_id:uploadedId}); await DeclarationModel.deleteMany({_id:declarationId});
      }
    }
    const aggregate:any={}; for(const r of reports) for(const [k,v] of Object.entries(r.lossBoundaryCounts)) aggregate[k]=(aggregate[k]??0)+Number(v);
    console.log(JSON.stringify({event:"product-e2e-1.6.4.generalization-stage-loss-diagnostic.measured",cases:reports.length,lossBoundaryCounts:aggregate,rawModelResponsePersistedForAllCases:reports.every(r=>r.observability.rawModelResponsePersisted),guardrails:{frozenGroundTruth:true,measurementOnly:true,secondGroundTruthAwareModelCall:false,productionExtractionChanged:false,supplierSpecificRules:false,directNormalizedWrite:false}},null,2));
  } finally { await closeIdpQueue(); await mongoose.disconnect(); }
}

main().catch(async(e)=>{console.error(e);try{await closeIdpQueue();}catch{}try{await mongoose.disconnect();}catch{}process.exitCode=1;});
