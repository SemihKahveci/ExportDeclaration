import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";

const rows = (fields: Record<string, any[]> | undefined, suffix: string) => Object.keys(fields ?? {})
  .map((field) => field.match(new RegExp(`^goodsLines\\.(\\d+)\\.${suffix}$`)))
  .filter((m): m is RegExpMatchArray => Boolean(m)).map((m) => Number(m[1])).sort((a,b)=>a-b);
const values = (fields: Record<string, any[]> | undefined, names: string[]) => Object.fromEntries(names.map((name) => [name, (fields?.[name] ?? []).map((c:any)=>({value:c.value,candidateId:c.candidateId,evidence:(c.evidence??[]).map((e:any)=>({pageNumber:e.pageNumber,contentSource:e.contentSource,text:e.text}))}))]));
const missing = (present:number[], expected:number[]) => expected.filter((x)=>!present.includes(x));

async function main(){
  await mongoose.connect(env.mongoUri);
  try {
    const upload:any=await UploadedFileModel.findOne({type:"INVOICE"}).sort({createdAt:-1}).lean();
    assert(upload,"No persisted INVOICE upload found.");
    const run:any=await ProcessingRunModel.findOne({uploadedFileId:upload._id,status:"COMPLETED"}).sort({createdAt:-1}).lean();
    assert(run?.canonicalDocument?.pages?.length,"Latest completed run has no canonical document.");
    const canonical=run.canonicalDocument as CanonicalDocument;
    const segmentId=Object.values(run?.declarationCandidates?.fields??{}).flat().map((c:any)=>c?.evidence?.[0]?.segmentId).find(Boolean)??"segment-001";
    const currentGeneric=discoverGenericInvoiceFieldCandidates(canonical,segmentId);
    const currentHeader=discoverInvoiceHeaderPartyFieldCandidates(canonical,segmentId);
    const currentCommercial=discoverInvoiceCommercialTermsFieldCandidates(canonical,segmentId);
    const currentShipment=discoverInvoiceShipmentFieldCandidates(canonical,segmentId);
    const persistedAudit=run?.candidates?.segments?.[0]?.data?.genericCandidateAudit ?? run?.genericCandidateAudit ?? {};
    const worker=run?.declarationCandidates?.fields ?? {};
    const resolution:any=await DeclarationFieldResolutionRunModel.findOne({declarationId:upload.declarationId}).sort({createdAt:-1}).lean();
    const declaration:any=await DeclarationModel.findById(upload.declarationId).lean();
    const f6Fields=resolution?.resolution?.fields ?? {};
    const normalizedGoods=Array.isArray(declaration?.normalizedData?.goodsLines)?declaration.normalizedData.goodsLines:[];

    const deterministicHs=rows(currentGeneric.fields as any,"hsCode");
    const persistedHs=rows(persistedAudit?.candidates?.fields,"hsCode");
    const workerHs=rows(worker,"hsCode");
    const nativeHs=Object.entries(worker).filter(([field,cands]:any)=>/^goodsLines\.\d+\.hsCode$/.test(field)&&(cands??[]).some((c:any)=>String(c.candidateId).endsWith(":f6-native-hs"))).map(([field])=>Number(field.split(".")[1])).sort((a,b)=>a-b);
    const f6ResolvedHs=Object.entries(f6Fields).filter(([field,r]:any)=>/^goodsLines\.\d+\.hsCode$/.test(field)&&r?.status==="RESOLVED"&&/^\d{12}$/.test(String(r?.value??"").replace(/\D/g,""))).map(([field])=>Number(field.split(".")[1])).sort((a,b)=>a-b);
    const normalizedHs=normalizedGoods.map((g:any,i:number)=>/^\d{12}$/.test(String(g?.hsCode??"").replace(/\D/g,""))?i:undefined).filter((x:any)=>x!==undefined);
    const expected=deterministicHs;

    console.log(JSON.stringify({
      event:"product-e2e-1.8.27.source-present-ui-gaps.diagnosed",
      upload:{fileName:upload.fileName,id:String(upload._id)}, run:{id:String(run._id),status:run.status},
      gtipPipeline:{
        deterministicExact12:{count:deterministicHs.length,rows:deterministicHs},
        persistedGenericAudit:{count:persistedHs.length,missingFromCurrent:missing(persistedHs,expected)},
        workerCandidate:{count:workerHs.length,missingFromCurrent:missing(workerHs,expected)},
        nativeAuthorityCandidate:{count:nativeHs.length,missingFromCurrent:missing(nativeHs,expected)},
        foundation6Resolved:{count:f6ResolvedHs.length,missingFromCurrent:missing(f6ResolvedHs,expected)},
        normalizedData:{count:normalizedHs.length,missingFromCurrent:missing(normalizedHs,expected)},
      },
      parties:{
        currentDeterministic:values(currentHeader.fields as any,["parties.seller.name","parties.seller.address","parties.seller.country","parties.buyer.name","parties.buyer.address","parties.buyer.country"]),
        worker:values(worker,["parties.seller.name","parties.seller.address","parties.seller.country","parties.buyer.name","parties.buyer.address","parties.buyer.country"]),
        foundation6:Object.fromEntries(["parties.seller.name","parties.seller.address","parties.seller.country","parties.buyer.name","parties.buyer.address","parties.buyer.country"].map(k=>[k,f6Fields[k]?{status:f6Fields[k].status,value:f6Fields[k].value,reason:f6Fields[k].reason}:null])),
        normalized:declaration?.normalizedData?.parties??null,
      },
      transportAndPackage:{
        currentCommercial:values(currentCommercial.fields as any,["transport.mode","trade.deliveryTerm"]),
        currentShipment:values(currentShipment.fields as any,["shipment.totalPackage","shipment.packageType","shipment.grossWeight","shipment.netWeight"]),
        worker:values(worker,["transportMode","deliveryTerm","totalPackage","packageType","grossWeight","netWeight"]),
        foundation6:Object.fromEntries(["transportMode","deliveryTerm","totalPackage","packageType","grossWeight","netWeight"].map(k=>[k,f6Fields[k]?{status:f6Fields[k].status,value:f6Fields[k].value,reason:f6Fields[k].reason}:null])),
        normalized:{transport:declaration?.normalizedData?.transport??null,packageInfo:declaration?.normalizedData?.packageInfo??null},
      },
      guardrails:{persistedCanonicalEvidenceOnly:true,currentGeneralDeterministicParsersOnly:true,supplierSpecificRules:false,invoiceSpecificConstants:false,ocrOrModelInference:false,databaseMutation:false,directNormalizedWrite:false},
    },null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(async(error)=>{console.error(error);try{await mongoose.disconnect();}catch{}process.exitCode=1;});
