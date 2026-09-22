import mongoose from "mongoose";
import { DocumentType, type DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { DocumentSegment } from "./documentSegment.types.js";
import type { SegmentClassification } from "./segmentClassification.types.js";
import { LogicalDocumentModel } from "./logicalDocument.model.js";

const CLASSIFIED_TO_DOCUMENT: Record<string, DocumentTypeValue> = {
  INVOICE: DocumentType.INVOICE, PACKING_LIST: DocumentType.PACKING_LIST, ATR: DocumentType.ATR,
  EUR1: DocumentType.EUR1, CERTIFICATE_OF_ORIGIN: DocumentType.CERTIFICATE_OF_ORIGIN,
  BILL_OF_LADING: DocumentType.BILL_OF_LADING, CMR: DocumentType.CMR, UNKNOWN: DocumentType.OTHER
};

export async function materializeLogicalDocuments(params:{
 companyId:mongoose.Types.ObjectId; declarationId:mongoose.Types.ObjectId; uploadedFileId:mongoose.Types.ObjectId;
 processingRunId:mongoose.Types.ObjectId; segments:DocumentSegment[]; classifications:SegmentClassification[];
}) {
 const bySegment=new Map(params.classifications.map(c=>[c.segmentId,c]));
 const keep:string[]=[];
 for(const segment of params.segments){
  const classification=bySegment.get(segment.segmentId);
  if(!classification) throw new Error(`Classification bulunamadı: ${segment.segmentId}`);
  const logical=await LogicalDocumentModel.findOneAndUpdate(
   {companyId:params.companyId,declarationId:params.declarationId,uploadedFileId:params.uploadedFileId,pageStart:segment.startPage,pageEnd:segment.endPage},
   {$set:{type:CLASSIFIED_TO_DOCUMENT[classification.documentType]??DocumentType.OTHER,classificationConfidence:classification.confidence,classificationMethod:"DETERMINISTIC",classificationEvidence:classification.evidence,sourceProcessingRunId:params.processingRunId}},
   {upsert:true,new:true,setDefaultsOnInsert:true}
  );
  keep.push(String(logical._id));
 }
 await LogicalDocumentModel.deleteMany({uploadedFileId:params.uploadedFileId,_id:{$nin:keep.map(id=>new mongoose.Types.ObjectId(id))}});
 return LogicalDocumentModel.find({uploadedFileId:params.uploadedFileId}).sort({pageStart:1}).lean();
}
