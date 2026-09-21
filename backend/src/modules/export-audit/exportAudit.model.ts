import mongoose,{Schema} from "mongoose";
export const EXPORT_FORMATS=["EVRIM_EXCEL","UBL_IHRACAT"] as const;
export interface ExportAuditDoc extends mongoose.Document{
 companyId:mongoose.Types.ObjectId;declarationId:mongoose.Types.ObjectId;format:string;
 normalizedSnapshot:unknown;masterDataSnapshot:unknown;persistentHumanSnapshot:unknown;requestHumanSnapshot:unknown;
 effectiveSupplementsSnapshot:unknown;contractSnapshot:unknown;masterDataTraceSnapshot:unknown;
 output:{filename:string;rowCount?:number;lineCount?:number;sha256:string};
 createdAt:Date;updatedAt:Date;
}
const schema=new Schema<ExportAuditDoc>({
 companyId:{type:Schema.Types.ObjectId,required:true,index:true,immutable:true},
 declarationId:{type:Schema.Types.ObjectId,required:true,index:true,immutable:true},
 format:{type:String,enum:EXPORT_FORMATS,required:true,immutable:true},
 normalizedSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 masterDataSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 persistentHumanSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 requestHumanSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 effectiveSupplementsSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 contractSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 masterDataTraceSnapshot:{type:Schema.Types.Mixed,required:true,immutable:true},
 output:{type:Schema.Types.Mixed,required:true,immutable:true},
},{timestamps:true,versionKey:false,minimize:false});
schema.index({companyId:1,declarationId:1,createdAt:-1});
schema.pre(["updateOne","updateMany","findOneAndUpdate","replaceOne"],function(){throw new Error("Export audit snapshots are immutable.");});
export const ExportAuditModel:mongoose.Model<ExportAuditDoc>=(mongoose.models.ExportAudit as mongoose.Model<ExportAuditDoc>|undefined)??mongoose.model<ExportAuditDoc>("ExportAudit",schema);
