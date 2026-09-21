import {createHash} from "node:crypto";
import mongoose from "mongoose";
import {ExportAuditModel} from "./exportAudit.model.js";
export async function recordExportAudit(input:{
 companyId:mongoose.Types.ObjectId;declarationId:string;format:"EVRIM_EXCEL"|"UBL_IHRACAT";
 normalizedSnapshot:unknown;masterDataSnapshot:unknown;persistentHumanSnapshot:unknown;requestHumanSnapshot:unknown;
 effectiveSupplementsSnapshot:unknown;contractSnapshot:unknown;masterDataTraceSnapshot:unknown;
 output:{filename:string;rowCount?:number;lineCount?:number;buffer:Buffer};
}){
 const {buffer,...output}=input.output;
 return ExportAuditModel.create({
  companyId:input.companyId,declarationId:new mongoose.Types.ObjectId(input.declarationId),format:input.format,
  normalizedSnapshot:input.normalizedSnapshot,masterDataSnapshot:input.masterDataSnapshot,
  persistentHumanSnapshot:input.persistentHumanSnapshot,requestHumanSnapshot:input.requestHumanSnapshot,
  effectiveSupplementsSnapshot:input.effectiveSupplementsSnapshot,contractSnapshot:input.contractSnapshot,
  masterDataTraceSnapshot:input.masterDataTraceSnapshot,
  output:{...output,sha256:createHash("sha256").update(buffer).digest("hex")},
 });
}
