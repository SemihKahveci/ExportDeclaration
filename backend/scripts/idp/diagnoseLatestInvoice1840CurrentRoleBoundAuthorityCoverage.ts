import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import type { CanonicalDocument } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import { discoverGenericInvoiceFieldCandidates } from "../../src/modules/idp/candidates/genericInvoiceCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceOriginFieldCandidates } from "../../src/modules/idp/candidates/invoiceOriginCandidateDiscovery.js";

type Candidate = { value: unknown; candidateId?: string; evidence?: unknown[] };
type Envelope = { fields?: Record<string, Candidate[]> };
type Row = { section:string; label:string; field:string|null; sourceFields:string[]; conditional?:boolean; note?:string };

const rows: Row[] = [
  {section:"PARTY",label:"Gönderici",field:"parties.seller.name",sourceFields:["parties.seller.name"]},
  {section:"PARTY",label:"Alıcı",field:"parties.buyer.name",sourceFields:["parties.buyer.name"]},
  {section:"PARTY",label:"Gideceği Ülke",field:"destinationCountry",sourceFields:["destinationCountry"]},
  {section:"PARTY",label:"Ticaret Yapılan Ülke",field:"tradeCountry",sourceFields:["tradeCountry"]},
  {section:"PARTY",label:"Çıkış Ülke",field:"exitCountry",sourceFields:["exitCountry"]},
  {section:"PARTY",label:"Varış Ülke",field:"arrivalCountry",sourceFields:["arrivalCountry"]},
  {section:"TRANSPORT",label:"Teslim Şekli",field:"deliveryTerm",sourceFields:["trade.deliveryTerm","deliveryTerm"]},
  {section:"TRANSPORT",label:"Çıkış Araç Kimliği",field:"departureVehicleId",sourceFields:["departureVehicleId"]},
  {section:"TRANSPORT",label:"Sınır Araç Kimliği",field:"borderVehicleId",sourceFields:["borderVehicleId"]},
  {section:"TRANSPORT",label:"Çıkış Araç Ülke",field:null,sourceFields:[],note:"No dedicated declaration candidate field."},
  {section:"TRANSPORT",label:"Sınır Araç Ülke",field:null,sourceFields:[],note:"No dedicated declaration candidate field."},
  {section:"TRANSPORT",label:"Konteyner Bilgisi",field:"containerNo",sourceFields:["containerNo"]},
  {section:"TRANSPORT",label:"Tır Konteyner Sayısı",field:null,sourceFields:[],conditional:true,note:"Conditional on container evidence; no dedicated declaration candidate field."},
  {section:"VALUE",label:"Döviz ve Toplam Fatura",field:"totalAmount",sourceFields:["header.totalAmount","totalAmount"]},
  {section:"VALUE",label:"Döviz Kuru",field:"exchangeRate",sourceFields:["finance.exchangeRate","exchangeRate"]},
  {section:"VALUE",label:"Finansal ve Bankacılık",field:"bankInfo",sourceFields:["finance.bankInfo","bankInfo"]},
  {section:"VALUE",label:"Banka Adı",field:null,sourceFields:[],note:"Specification separates bank name; current declaration schema exposes bankInfo only."},
  {section:"VALUE",label:"Ödeme Şekli",field:"paymentType",sourceFields:["trade.paymentType","paymentType"]},
  {section:"PACKAGE_WEIGHT",label:"Kap Adedi",field:"totalPackage",sourceFields:["packageInfo.totalPackage","totalPackage"]},
  {section:"PACKAGE_WEIGHT",label:"Brüt Kilo",field:"grossWeight",sourceFields:["packageInfo.grossKg","grossWeight"]},
  {section:"PACKAGE_WEIGHT",label:"Net Kilo",field:"netWeight",sourceFields:["packageInfo.netKg","netWeight"]},
  {section:"PACKAGE_WEIGHT",label:"Tamamlayıcı Ölçü",field:null,sourceFields:[],note:"No dedicated scalar candidate field; row-level absence is gated by 1.8.38."}
];

function merged(...envs: Envelope[]) {
  const out: Record<string,Candidate[]> = {};
  for (const env of envs) for (const [field, cs] of Object.entries(env.fields ?? {})) out[field] = [...(out[field] ?? []), ...cs];
  return out;
}
function uniqueValues(cs: Candidate[]) { return [...new Set(cs.map(c=>String(c.value)))]; }

async function main(){
  await mongoose.connect(env.mongoUri);
  try {
    const upload:any=await UploadedFileModel.findOne({type:"INVOICE"}).sort({createdAt:-1}).lean(); assert(upload,"No persisted INVOICE upload found.");
    const run:any=await ProcessingRunModel.findOne({uploadedFileId:upload._id,status:"COMPLETED"}).sort({createdAt:-1}).lean(); assert(run?.canonicalDocument?.pages?.length,"Latest completed run has no canonicalDocument.");
    const canonical=run.canonicalDocument as CanonicalDocument; const segmentId="segment-001";
    const generic=discoverGenericInvoiceFieldCandidates(canonical,segmentId);
    const header=discoverInvoiceHeaderPartyFieldCandidates(canonical,segmentId);
    const shipment=discoverInvoiceShipmentFieldCandidates(canonical,segmentId);
    const commercial=discoverInvoiceCommercialTermsFieldCandidates(canonical,segmentId);
    const origins=discoverInvoiceOriginFieldCandidates(canonical,segmentId,generic);
    const fields=merged(generic,header,shipment,commercial,origins);

    const matrix=rows.map(row=>{
      const candidates=row.sourceFields.flatMap(f=>fields[f]??[]);
      const values=uniqueValues(candidates);
      let classification:string;
      if(row.field===null) classification=row.conditional?"SCHEMA_ABSENT_CONDITIONAL_SOURCE_NOT_PROVEN":"SCHEMA_ABSENT_NO_ROLE_SOURCE_PROVEN";
      else if(candidates.length>0) classification="CURRENT_ROLE_BOUND_SOURCE_COVERED";
      else classification="CURRENT_ROLE_SOURCE_ABSENT_FAIL_CLOSED";
      return {...row,candidateCount:candidates.length,candidateValues:values,classification};
    });

    const expected:Record<string,string|number>={
      "deliveryTerm":"FCA","totalAmount":31081.1,"exchangeRate":53.3268,"paymentType":"PESIN ODEME","totalPackage":2,"grossWeight":554,"netWeight":530
    };
    const currentValues:Record<string,unknown>={};
    for(const row of matrix){ if(!row.field || !row.candidateValues.length) continue; currentValues[row.field]=row.candidateValues[0]; }
    const normalized=(v:unknown)=>typeof v==="string"?v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/Ş/g,"S").replace(/ş/g,"s").replace(/İ/g,"I").replace(/ı/g,"i").toUpperCase():v;
    const acceptance={
      deliveryTermCurrent: normalized(currentValues.deliveryTerm)===normalized(expected.deliveryTerm),
      totalAmountCurrent: Number(currentValues.totalAmount)===expected.totalAmount,
      exchangeRateCurrent: Number(currentValues.exchangeRate)===expected.exchangeRate,
      paymentTypeCurrent: normalized(currentValues.paymentType)===normalized(expected.paymentType),
      bankInfoAbsentCurrent: !(matrix.find(r=>r.field==="bankInfo")?.candidateCount),
      totalPackageCurrent: Number(currentValues.totalPackage)===expected.totalPackage,
      grossWeightCurrent: Number(currentValues.grossWeight)===expected.grossWeight,
      netWeightCurrent: Number(currentValues.netWeight)===expected.netWeight,
      customsCountriesFailClosed:["destinationCountry","tradeCountry","exitCountry","arrivalCountry"].every(f=>!(matrix.find(r=>r.field===f)?.candidateCount)),
      vehicleAndContainerFailClosed:["departureVehicleId","borderVehicleId","containerNo"].every(f=>!(matrix.find(r=>r.field===f)?.candidateCount))
    };
    assert(Object.values(acceptance).every(Boolean),`1.8.40 acceptance failed: ${JSON.stringify(acceptance)}`);
    console.log(JSON.stringify({
      event:"product-e2e-1.8.40.current-role-bound-authority-coverage.passed",
      upload:{fileName:upload.originalName??upload.fileName,id:String(upload._id)},run:{id:String(run._id),status:run.status},
      acceptance,
      currentValues,
      summary:{covered:matrix.filter(r=>r.classification==="CURRENT_ROLE_BOUND_SOURCE_COVERED").length,failClosed:matrix.filter(r=>r.classification==="CURRENT_ROLE_SOURCE_ABSENT_FAIL_CLOSED").length,schemaAbsent:matrix.filter(r=>r.classification.startsWith("SCHEMA_ABSENT")).length},
      coverageMatrix:matrix,
      interpretation:{
        vocabulary:"1.8.39 compared declaration field names directly against parser-native field names. 1.8.40 maps the current parser vocabulary before judging coverage.",
        bankInfo:"A broad BANK-like text hint is not bank authority. Current semantic parser output must contain finance.bankInfo; otherwise bankInfo remains absent.",
        countries:"Country tokens without exact customs-role evidence remain fail-closed.",
        schema:"A schema gap is not a production extraction bug when this invoice has no proven role-specific source for that field."
      },
      guardrails:{acceptanceOnly:true,persistedCanonicalEvidenceOnly:true,currentGeneralDeterministicParsersOnly:true,ocrOrModelInference:false,databaseMutation:false,supplierSpecificRules:false,invoiceSpecificConstants:false,directNormalizedWrite:false}
    },null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(async e=>{console.error(e);try{await mongoose.disconnect();}catch{}process.exitCode=1;});
