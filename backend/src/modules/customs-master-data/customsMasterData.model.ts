import mongoose, { Schema } from "mongoose";

export const CUSTOMS_MASTER_SCOPES = ["DECLARATION_DEFAULT", "PRODUCT", "HS"] as const;
export type CustomsMasterScope = (typeof CUSTOMS_MASTER_SCOPES)[number];

export interface CustomsMasterDataDoc extends mongoose.Document {
  companyId: mongoose.Types.ObjectId; customerId?: string; scope: CustomsMasterScope; key: string;
  values: { declarationType?:string; exportType?:string; customsOffice?:string; regimeCode?:string;
    brand?:string; exemptionCode?:string; permitCode?:string; utsNo?:string; usedFlag?:string; };
  active:boolean; createdAt:Date; updatedAt:Date;
}
const ValuesSchema=new Schema({declarationType:String,exportType:String,customsOffice:String,regimeCode:String,
  brand:String,exemptionCode:String,permitCode:String,utsNo:String,usedFlag:String},{_id:false});
const CustomsMasterDataSchema=new Schema({
  companyId:{type:Schema.Types.ObjectId,required:true,index:true},customerId:{type:String,default:undefined,index:true},
  scope:{type:String,enum:CUSTOMS_MASTER_SCOPES,required:true,index:true},key:{type:String,required:true,trim:true,index:true},
  values:{type:ValuesSchema,required:true},active:{type:Boolean,default:true,index:true}
},{timestamps:true});
CustomsMasterDataSchema.index({companyId:1,customerId:1,scope:1,key:1},{unique:true,name:"customs_master_scope_key"});
export const CustomsMasterDataModel=mongoose.models.CustomsMasterData ??
  mongoose.model<CustomsMasterDataDoc>("CustomsMasterData",CustomsMasterDataSchema);
