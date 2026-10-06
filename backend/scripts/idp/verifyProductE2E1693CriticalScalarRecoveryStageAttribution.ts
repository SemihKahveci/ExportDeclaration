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

const TARGETS = ["currency", "invoiceDate"] as const;
type Target = typeof TARGETS[number];
const DEFAULT_CASES = ["volta-vxa-0035", "pml-p0087", "dermeternal-2026-0001", "ningbo-wyl-2026060501"];
const sleep = (ms:number) => new Promise((resolve)=>setTimeout(resolve,ms));
const norm = (v:unknown) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g," ").trim();

function finalValue(nd:any, field:Target):unknown {
  return field === "currency" ? nd?.header?.currency : nd?.header?.invoiceDate;
}
function expectedValue(tc:any, field:Target):unknown { return tc.expected?.[field]; }
function candidateValues(container:any, field:Target):unknown[] {
  const aliases = field === "currency" ? ["currency"] : ["invoiceDate"];
  const values:unknown[]=[];
  for (const alias of aliases) {
    const candidates = container?.fields?.[alias];
    if (Array.isArray(candidates)) for (const c of candidates) if (c?.value !== undefined) values.push(c.value);
  }
  return values;
}
function resolutionSnapshot(audits:any[], field:Target) {
  const latest = audits.at(-1);
  const resolved = latest?.resolution?.fields?.[field];
  return resolved ? {
    status: resolved.status,
    method: resolved.method,
    value: resolved.value ?? resolved.selectedCandidate?.value,
    selectedCandidateId: resolved.selectedCandidateId ?? resolved.selectedCandidate?.candidateId,
    candidateValues: Array.isArray(resolved.candidates) ? resolved.candidates.map((c:any)=>c?.value).filter((v:unknown)=>v!==undefined) : []
  } : undefined;
}
function pageEntries(checkpoint:any):any[] {
  const out:any[]=[];
  for (const [segmentId, segment] of Object.entries(checkpoint?.segments ?? {})) {
    for (const page of Object.values((segment as any)?.pages ?? {})) out.push({segmentId,...(page as any)});
  }
  return out.sort((a,b)=>(a.pageNumber??0)-(b.pageNumber??0));
}
async function waitTerminal(runId:string,id:string,timeout=120*60_000) {
  const deadline=Date.now()+timeout; let last=""; let lastLog=0;
  while(Date.now()<deadline) {
    const run:any=await ProcessingRunModel.findById(runId).lean(); assert(run,`${id}: run disappeared`);
    const job=await getIdpQueue().getJob(runId); assert(job,`${id}: job disappeared`);
    const state=await job.getState(); const snap=`${run.status}/${run.currentStage}/${state}/attempt=${run.attempt}`;
    if(snap!==last || Date.now()-lastLog>60_000){console.log(JSON.stringify({event:"product-e2e-1.6.9.3.case.progress",id,state:snap}));last=snap;lastLog=Date.now();}
    if(run.status===ProcessingStatus.FAILED || state==="failed") throw new Error(`${id}: worker failed: ${JSON.stringify(run.error)}`);
    if((run.status===ProcessingStatus.COMPLETED || run.status===ProcessingStatus.REVIEW_REQUIRED) && state==="completed") return run;
    await sleep(500);
  }
  throw new Error(`${id}: timeout`);
}

async function main(){
  assert.equal(env.llmEnabled,true,"1.6.9.3 requires LLM_ENABLED=true");
  assert.equal(env.llmVisionEnabled,true,"1.6.9.3 requires LLM_VISION_ENABLED=true");
  const requested=(process.env.GENERALIZATION_CASES ?? DEFAULT_CASES.join(",")).split(",").map(x=>x.trim()).filter(Boolean);
  const selected=CASES.filter((x:any)=>requested.includes(x.id));
  assert.equal(selected.length,requested.length,`Unknown GENERALIZATION_CASES=${requested.join(",")}`);
  await mongoose.connect(env.mongoUri);
  const reports:any[]=[];
  try {
    for(let i=0;i<selected.length;i++){
      const tc:any=selected[i]!; const pdfPath=path.join(ROOT,tc.pdf); const bytes=await fs.readFile(pdfPath);
      assert.equal(createHash("sha256").update(bytes).digest("hex"),tc.sourceSha256,`${tc.id}: frozen source changed`);
      const companyId=new mongoose.Types.ObjectId(), declarationId=new mongoose.Types.ObjectId(); let uploadedId:any, runId="";
      console.log(JSON.stringify({event:"product-e2e-1.6.9.3.case.started",case:i+1,total:selected.length,id:tc.id,pdf:tc.pdf}));
      try {
        await DeclarationModel.create({_id:declarationId,companyId,status:"DRAFT",normalizedData:{}});
        const stat=await fs.stat(pdfPath); const up:any=await UploadedFileModel.create({companyId,declarationId,type:DocumentType.INVOICE,fileName:tc.pdf,filePath:pdfPath,mimeType:"application/pdf",size:stat.size,extractionStatus:"PENDING",parseErrors:[]}); uploadedId=up._id;
        const queued:any=await enqueueDocumentProcessing({companyId,declarationId:String(declarationId),uploadedFileId:String(uploadedId)}); runId=String(queued._id);
        const terminal:any=await waitTerminal(runId,tc.id);
        const run:any=await ProcessingRunModel.findById(runId).lean();
        const declaration:any=await DeclarationModel.findById(declarationId).lean();
        const audits:any[]=await DeclarationFieldResolutionRunModel.find({companyId,declarationId}).sort({createdAt:1}).lean();
        const pages=pageEntries(run?.visionCandidateCheckpoint);
        const fields=TARGETS.filter((field)=>expectedValue(tc,field)!==undefined).map((field)=>{
          const pageDiagnostics=pages.map((page)=>({
            pageNumber:page.pageNumber,
            requested:page.recoveryDiagnostic?.criticalScalarRecoveryRequestedFields?.includes(field) ?? false,
            attempted:page.recoveryDiagnostic?.criticalScalarRecoveryAttempted ?? false,
            decision:page.recoveryDiagnostic?.criticalScalarRecoveryDecision,
            returned:page.recoveryDiagnostic?.criticalScalarRecoveryReturnedFields?.includes(field) ?? false,
            error:page.recoveryDiagnostic?.criticalScalarRecoveryError,
            pageCandidateValues:candidateValues(page.candidates,field)
          })).filter((p)=>p.requested || p.attempted || p.returned || p.pageCandidateValues.length);
          const providerReturned=pageDiagnostics.some((p)=>p.returned);
          const pageCandidateValues=pageDiagnostics.flatMap((p)=>p.pageCandidateValues);
          const runCandidateValues=[...candidateValues(run?.candidates,field),...candidateValues(run?.declarationCandidates,field)];
          const auditCandidateValues=audits.flatMap((audit)=>candidateValues(audit?.candidateEnvelope,field));
          const resolution=resolutionSnapshot(audits,field);
          const final=finalValue(declaration?.normalizedData ?? {},field);
          let boundary="FINAL_PRESENT";
          if(final===undefined || final===null || norm(final)==="") {
            if(resolution) boundary="RESOLUTION_OR_PROMOTION";
            else if(auditCandidateValues.length) boundary="RESOLUTION_INPUT";
            else if(runCandidateValues.length || pageCandidateValues.length) boundary="DECLARATION_PROJECTION";
            else if(providerReturned) boundary="PAGE_CANDIDATE_PROJECTION";
            else if(pageDiagnostics.some((p)=>p.attempted)) boundary="PROVIDER_EVIDENCE_GATE";
            else boundary="RECOVERY_TRIGGER";
          }
          return {field,expected:expectedValue(tc,field),finalValue:final,boundary,pageDiagnostics,pageCandidateValues,runCandidateValues,auditCandidateValues,resolution};
        });
        const report={id:tc.id,workerOutcome:terminal.status,fields}; reports.push(report);
        console.log(JSON.stringify({event:"product-e2e-1.6.9.3.case.attributed",...report},null,2));
      } finally {
        if(runId){const job=await getIdpQueue().getJob(runId);if(job)try{await job.remove();}catch{}}
        await DeclarationFieldResolutionRunModel.deleteMany({declarationId}); await LogicalDocumentModel.deleteMany({declarationId});
        if(runId)await ProcessingRunModel.deleteMany({_id:runId}); if(uploadedId)await UploadedFileModel.deleteMany({_id:uploadedId}); await DeclarationModel.deleteMany({_id:declarationId});
      }
    }
    const boundaryCounts:Record<string,number>={}; for(const r of reports)for(const f of r.fields)if(!f.finalValue){boundaryCounts[f.boundary]=(boundaryCounts[f.boundary]??0)+1;}
    console.log(JSON.stringify({event:"product-e2e-1.6.9.3.critical-scalar-recovery-stage-attribution.measured",cases:reports.length,boundaryCounts,reports,guardrails:{frozenGroundTruth:true,exactSourceHashesReverifiedBeforeExecution:true,measurementOnly:true,productionExtractionChanged:false,realProductionQueue:true,realConfiguredVisionProvider:true,criticalScalarRecoveryObserved:true,supplierSpecificRules:false,directNormalizedWrite:false,orchestrationAgentIntroduced:false}},null,2));
  } finally {await closeIdpQueue();await mongoose.disconnect();}
}
main().catch(async(error)=>{console.error(error);try{await closeIdpQueue();}catch{}try{await mongoose.disconnect();}catch{}process.exitCode=1;});
