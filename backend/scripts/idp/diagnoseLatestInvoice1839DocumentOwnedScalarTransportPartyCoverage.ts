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

type SpecRow = { section: string; label: string; internalField: string | null; semantic: RegExp[]; note?: string };

const spec: SpecRow[] = [
  { section:"PARTY", label:"Gönderici", internalField:"parties.seller.name", semantic:[/(sat[iı]c[iı]|seller|exporter|ve[kc]mar)/i] },
  { section:"PARTY", label:"Alıcı", internalField:"parties.buyer.name", semantic:[/(al[iı]c[iı]|buyer|consignee|power technology)/i] },
  { section:"PARTY", label:"Gideceği Ülke", internalField:"destinationCountry", semantic:[/(gidece[gğ]i\s*[uü]lke|destination\s*country|country\s*of\s*destination)/i] },
  { section:"PARTY", label:"Ticaret Yapılan Ülke", internalField:"tradeCountry", semantic:[/(ticaret\s*yap[iı]lan\s*[uü]lke|country\s*of\s*trade|trading\s*country)/i] },
  { section:"PARTY", label:"Çıkış Ülke", internalField:"exitCountry", semantic:[/(ç[iı]k[iı][sş]\s*[uü]lke|country\s*of\s*dispatch|country\s*of\s*export)/i] },
  { section:"PARTY", label:"Varış Ülke", internalField:"arrivalCountry", semantic:[/(var[iı][sş]\s*[uü]lke|country\s*of\s*arrival)/i] },
  { section:"TRANSPORT", label:"Teslim Şekli", internalField:"deliveryTerm", semantic:[/(teslim\s*[sş]ekli|incoterm|\bFCA\b|\bFOB\b|\bCIF\b|\bEXW\b)/i] },
  { section:"TRANSPORT", label:"Çıkış Araç Kimliği", internalField:"departureVehicleId", semantic:[/(ç[iı]k[iı][sş]\s*ara[çc]|departure\s*vehicle|vehicle\s*id|plaka|plate)/i] },
  { section:"TRANSPORT", label:"Sınır Araç Kimliği", internalField:"borderVehicleId", semantic:[/(s[iı]n[iı]r\s*ara[çc]|border\s*vehicle)/i] },
  { section:"TRANSPORT", label:"Çıkış Araç Ülke", internalField:null, semantic:[/(ç[iı]k[iı][sş]\s*ara[çc].*[uü]lke|departure\s*vehicle.*country)/i], note:"No dedicated current declaration candidate field." },
  { section:"TRANSPORT", label:"Sınır Araç Ülke", internalField:null, semantic:[/(s[iı]n[iı]r\s*ara[çc].*[uü]lke|border\s*vehicle.*country)/i], note:"No dedicated current declaration candidate field." },
  { section:"TRANSPORT", label:"Konteyner Bilgisi", internalField:"containerNo", semantic:[/(konteyner|container)/i] },
  { section:"TRANSPORT", label:"Tır Konteyner Sayısı", internalField:null, semantic:[/(t[iı]r.*konteyner.*say[iı]s[iı]|container\s*count)/i], note:"Conditional document-owned field; no dedicated current candidate field." },
  { section:"VALUE", label:"Döviz ve Toplam Fatura", internalField:"totalAmount", semantic:[/(genel\s*toplam|grand\s*total|invoice\s*total|d[oö]viz|currency|\bEUR\b|\bUSD\b)/i] },
  { section:"VALUE", label:"Döviz Kuru", internalField:"exchangeRate", semantic:[/(d[oö]viz\s*kuru|exchange\s*rate|kur\s*:)/i] },
  { section:"VALUE", label:"Finansal ve Bankacılık", internalField:"bankInfo", semantic:[/(banka|bank|iban|swift|bic|hesap|account)/i] },
  { section:"VALUE", label:"Banka Adı", internalField:null, semantic:[/(banka\s*ad[iı]|bank\s*name|\bbank\b)/i], note:"Specification separates bank name; current candidate schema has bankInfo only." },
  { section:"VALUE", label:"Ödeme Şekli", internalField:"paymentType", semantic:[/(ödem[e|a]\s*[sş]ekli|payment\s*(type|terms|method)|pe[sş]in\s*[oö]deme|cash\s*payment)/i] },
  { section:"PACKAGE_WEIGHT", label:"Kap Adedi", internalField:"totalPackage", semantic:[/(toplam\s*kap|kap\s*adedi|total\s*package)/i] },
  { section:"PACKAGE_WEIGHT", label:"Brüt Kilo", internalField:"grossWeight", semantic:[/(br[uü]t\s*(kilo|kg|a[gğ][iı]rl[iı]k|weight)|gross\s*weight)/i] },
  { section:"PACKAGE_WEIGHT", label:"Net Kilo", internalField:"netWeight", semantic:[/(net\s*(kilo|kg|a[gğ][iı]rl[iı]k|weight)|net\s*weight)/i] },
  { section:"PACKAGE_WEIGHT", label:"Tamamlayıcı Ölçü", internalField:null, semantic:[/(tamamlay[iı]c[iı]\s*[oö]l[cç][uü]|supplementary\s*(measure|unit))/i], note:"No dedicated current scalar candidate field; row-level source already gated by 1.8.38." }
];

function textOf(canonical:any) { return (canonical.pages ?? []).map((p:any)=>[p.text,...(p.words??[]).map((w:any)=>w.text)].filter(Boolean).join(" ")).join("\n"); }
function mergeFields(...envelopes:any[]) { const out:Record<string,any[]>={}; for(const env of envelopes) for(const [f,cs] of Object.entries(env?.fields??{})) out[f]=[...(out[f]??[]),...(cs as any[])]; return out; }

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
    const fields=mergeFields(generic,header,shipment,commercial,origins); const text=textOf(canonical);
    const matrix=spec.map(row=>{
      const candidateCount=row.internalField ? (fields[row.internalField]?.length??0) : 0;
      const values=row.internalField ? [...new Set((fields[row.internalField]??[]).map((c:any)=>String(c.value)))].slice(0,8) : [];
      const semanticSourcePresent=row.semantic.some(rx=>rx.test(text));
      let classification:string;
      if(!row.internalField) classification=semanticSourcePresent?"SCHEMA_GAP_SOURCE_HINT_PRESENT":"SCHEMA_GAP_SOURCE_ABSENT";
      else if(candidateCount>0) classification="CURRENT_CANDIDATE_COVERED";
      else if(semanticSourcePresent) classification="SOURCE_HINT_PRESENT_NEEDS_ROLE_LOCAL_DIAGNOSTIC";
      else classification="SOURCE_ABSENT_FAIL_CLOSED";
      return {...row, semantic:undefined, candidateCount, candidateValues:values, semanticSourcePresent, classification};
    });
    const sourceHintGaps=matrix.filter(r=>r.classification==="SOURCE_HINT_PRESENT_NEEDS_ROLE_LOCAL_DIAGNOSTIC"||r.classification==="SCHEMA_GAP_SOURCE_HINT_PRESENT");
    const covered=matrix.filter(r=>r.classification==="CURRENT_CANDIDATE_COVERED");
    const absent=matrix.filter(r=>r.classification==="SOURCE_ABSENT_FAIL_CLOSED"||r.classification==="SCHEMA_GAP_SOURCE_ABSENT");
    console.log(JSON.stringify({
      event:"product-e2e-1.8.39.document-owned-scalar-transport-party-coverage.diagnosed",
      upload:{fileName:upload.originalName??upload.fileName,id:String(upload._id)}, run:{id:String(run._id),status:run.status},
      declarationSpecification:{documentOwnedNonGoodsFieldCount:spec.length, source:"Beyanname Alanlari supplied specification", excludes:"User / Settings / Evrim / Calculated ownership"},
      summary:{coveredCandidateFields:covered.length, sourceHintGapCount:sourceHintGaps.length, sourceAbsentOrUnsupportedWithoutHintCount:absent.length},
      sourceHintGaps, coverageMatrix:matrix,
      interpretation:{
        covered:"Current deterministic candidate discovery has document evidence for the mapped field.",
        sourceHintGap:"Text contains only a semantic hint. This is not authority; inspect role/local context before adding a parser or schema field.",
        sourceAbsent:"Document-owned does not mean every invoice contains the field. Keep it empty when role-specific source evidence is absent.",
        noCountryInference:"Buyer/seller addresses, row origins and arbitrary country tokens cannot authorize customs country roles."
      },
      guardrails:{diagnosticOnly:true,persistedCanonicalEvidenceOnly:true,ocrOrModelInference:false,databaseMutation:false,supplierSpecificRules:false,invoiceSpecificConstants:false,directNormalizedWrite:false}
    },null,2));
  } finally { await mongoose.disconnect(); }
}
main().catch(async e=>{console.error(e);try{await mongoose.disconnect();}catch{}process.exitCode=1;});
