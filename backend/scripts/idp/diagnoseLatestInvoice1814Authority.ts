import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { UploadedFileModel } from "../../src/modules/documents/document.model.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { normalizeModelExtractionArtifacts } from "../../src/modules/idp/domain/modelExtractionArtifactPersistence.js";

const targets = [
  "parties.seller.name","parties.seller.address","parties.seller.country",
  "parties.buyer.name","parties.buyer.address","parties.buyer.country",
  "totalAmount","grossWeight","netWeight",
  "transportMode","carrier","departureVehicleId","borderVehicleId","vehiclePlate",
  "containerNo","billOfLadingNo","cmrNo","awbNo","transportDocumentNo"
];
const compact=(c:any)=>({value:c?.value,confidence:c?.confidence,extractor:c?.extractor,evidence:(c?.evidence??[]).map((e:any)=>({pageNumber:e?.pageNumber,contentSource:e?.contentSource,text:e?.text,quote:e?.quote}))});
const selected=(envl:any)=>Object.fromEntries(targets.filter(k=>envl?.fields?.[k]?.length).map(k=>[k,envl.fields[k].map(compact)]));

async function main(){
 await mongoose.connect(env.mongoUri);
 try{
  const upload:any=await UploadedFileModel.findOne({type:"INVOICE"}).sort({createdAt:-1}).lean();
  if(!upload) throw new Error("No persisted INVOICE upload found");
  const run:any=await ProcessingRunModel.findOne({uploadedFileId:upload._id}).sort({createdAt:-1}).lean();
  if(!run) throw new Error("No ProcessingRun found for latest INVOICE upload");
  const dec:any=await DeclarationModel.findById(upload.declarationId).lean();
  const resolutions:any[]=await DeclarationFieldResolutionRunModel.find({declarationId:upload.declarationId}).sort({createdAt:1}).lean();
  const segments=Array.isArray(run?.candidates?.segments)?run.candidates.segments:[];
  const artifacts=normalizeModelExtractionArtifacts(run?.modelExtractionArtifacts);
  const artifactFields=artifacts.map((a:any)=>({pageNumbers:a.pageNumbers,documentId:a.documentId,fields:(a.parsedSemanticResponse?.fields??[]).filter((f:any)=>["seller","sellerAddress","sellerCountry","buyer","buyerAddress","buyerCountry","totalAmount","grossKg","netKg","transportMode","carrier","departureVehicleId","borderVehicleId","vehiclePlate","containerNo","billOfLadingNo","cmrNo","awbNo","transportDocumentNo"].includes(f.field)).map((f:any)=>({field:f.field,value:f.value,evidence:f.evidence}))})).filter((x:any)=>x.fields.length);
  console.log(JSON.stringify({event:"product-e2e-1.8.14.latest-invoice-authority.diagnosed",upload:{fileName:upload.fileName,id:String(upload._id)},run:{id:String(run._id),status:run.status},visionArtifacts:artifactFields,workerCandidates:selected(run?.declarationCandidates),segmentCandidates:segments.map((s:any)=>({segmentId:s.segmentId,fieldCandidates:selected(s?.data?.fieldCandidates),headerPartyCandidates:selected(s?.data?.genericCandidateAudit?.headerPartyCandidates),shipmentCandidates:selected(s?.data?.genericCandidateAudit?.shipmentCandidates)})),f6:resolutions.map((r:any)=>({id:String(r._id),reviewRequiredFields:(r?.resolution?.reviewRequiredFields??[]).filter((x:string)=>targets.includes(x)),fields:Object.fromEntries(targets.filter(k=>r?.resolution?.fields?.[k]!==undefined).map(k=>[k,r.resolution.fields[k]]))})),final:{parties:dec?.normalizedData?.parties??null,header:{totalAmount:dec?.normalizedData?.header?.totalAmount??null,currency:dec?.normalizedData?.header?.currency??null},packageInfo:dec?.normalizedData?.packageInfo??null,transport:dec?.normalizedData?.transport??null},guardrails:{diagnosticOnly:true,noDatabaseMutation:true,noModelInference:true}},null,2));
 }finally{await mongoose.disconnect();}
}
main().catch(async e=>{console.error(e);try{await mongoose.disconnect();}catch{}process.exitCode=1;});
