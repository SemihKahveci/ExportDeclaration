import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";

const targets = [
  "paymentType","bankInfo","freight","insurance","totalAmount","currency","exchangeRate","deliveryTerm","transportMode",
  "totalPackage","packageType","grossWeight","netWeight","parties.seller.name","parties.buyer.name","parties.buyer.country",
  "originCountry","exitCountry","arrivalCountry","destinationCountry","tradeCountry","departureVehicleId","borderVehicleId","containerNo"
];

const compact = (c:any) => ({
  candidateId:c?.candidateId, value:c?.value, confidence:c?.confidence, extractor:c?.extractor, derived:c?.derived,
  evidence:(c?.evidence??[]).map((e:any)=>({pageNumber:e?.pageNumber,contentSource:e?.contentSource,text:e?.text,quote:e?.quote}))
});
const picked = (envl:any) => Object.fromEntries(targets.filter(k=>envl?.fields?.[k]?.length).map(k=>[k,envl.fields[k].map(compact)]));
const resolutionFields = (r:any) => Object.fromEntries(targets.filter(k=>r?.resolution?.fields?.[k]!==undefined).map(k=>[k,r.resolution.fields[k]]));

async function main(){
  await mongoose.connect(env.mongoUri);
  try {
    const upload:any = await UploadedFileModel.findOne({type:"INVOICE"}).sort({createdAt:-1}).lean();
    if(!upload) throw new Error("No persisted INVOICE upload found");
    const run:any = await ProcessingRunModel.findOne({uploadedFileId:upload._id}).sort({createdAt:-1}).lean();
    if(!run) throw new Error("No ProcessingRun found for latest INVOICE upload");
    const declaration:any = await DeclarationModel.findById(upload.declarationId).lean();
    const resolutions:any[] = await DeclarationFieldResolutionRunModel.find({declarationId:upload.declarationId}).sort({createdAt:1}).lean();
    const latestResolution:any = resolutions.at(-1);
    const persistedPayment = run?.declarationCandidates?.fields?.paymentType ?? [];
    const persistedBank = run?.declarationCandidates?.fields?.bankInfo ?? [];
    const goods = declaration?.normalizedData?.goodsLines ?? [];
    const goodsOriginCount = goods.filter((x:any)=>String(x?.origin??"").trim()).length;
    const goodsHsCount = goods.filter((x:any)=>String(x?.hsCode??"").trim()).length;
    const final = {
      paymentType: declaration?.normalizedData?.trade?.paymentType ?? null,
      bankInfo: declaration?.normalizedData?.finance?.bankInfo ?? null,
      freight: declaration?.normalizedData?.finance?.freight ?? null,
      insurance: declaration?.normalizedData?.finance?.insurance ?? null,
      totalAmount: declaration?.normalizedData?.header?.totalAmount ?? null,
      currency: declaration?.normalizedData?.header?.currency ?? null,
      exchangeRate: declaration?.normalizedData?.finance?.exchangeRate ?? null,
      deliveryTerm: declaration?.normalizedData?.trade?.deliveryTerm ?? null,
      transportMode: declaration?.normalizedData?.transport?.mode ?? null,
      totalPackage: declaration?.normalizedData?.packageInfo?.totalPackage ?? null,
      packageType: declaration?.normalizedData?.packageInfo?.packageType ?? null,
      grossWeight: declaration?.normalizedData?.packageInfo?.grossKg ?? null,
      netWeight: declaration?.normalizedData?.packageInfo?.netKg ?? null,
      goodsRowCount: goods.length,
      goodsHsCount,
      goodsOriginCount
    };
    const observedRegression = {
      paymentTypePoisonPersisted: persistedPayment.some((c:any)=>String(c?.value??"").trim()==="0,00 EUR"),
      bankInfoPoisonPersisted: persistedBank.some((c:any)=>String(c?.value??"").trim()==="0,00 EUR"),
      paymentTypePoisonPromoted: String(final.paymentType??"").trim()==="0,00 EUR",
      bankInfoPoisonPromoted: String(final.bankInfo??"").trim()==="0,00 EUR"
    };
    console.log(JSON.stringify({
      event:"product-e2e-1.8.42.fresh-production-boundary.diagnosed",
      upload:{fileName:upload.fileName,id:String(upload._id),declarationId:String(upload.declarationId),createdAt:upload.createdAt},
      run:{id:String(run._id),status:run.status,createdAt:run.createdAt,processorVersion:run.processorVersion??null},
      persistedWorkerCandidates:picked(run?.declarationCandidates),
      f6:{runCount:resolutions.length,latestRunId:latestResolution?String(latestResolution._id):null,latest:latestResolution?resolutionFields(latestResolution):{}},
      final,
      observedRegression,
      diagnosisHint: observedRegression.paymentTypePoisonPersisted || observedRegression.bankInfoPoisonPersisted
        ? "Fresh worker persistence still contains Vision monetary poison; current in-memory replay correctness is not yet wired into the fresh production persistence path."
        : "Fresh worker candidates are clean; inspect F6 selection/promotion if final normalized values are still poisoned.",
      guardrails:{diagnosticOnly:true,freshPersistedProductionState:true,ocrOrModelInference:false,databaseMutation:false,supplierSpecificRules:false,invoiceSpecificConstants:false,directNormalizedWrite:false}
    },null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(async e=>{console.error(e);try{await mongoose.disconnect();}catch{}process.exitCode=1;});
