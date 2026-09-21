import mongoose, { Schema } from "mongoose";

export const CUSTOMS_SUPPLEMENT_ACTIONS=["SET","CLEAR"] as const;
export type CustomsSupplementAction=typeof CUSTOMS_SUPPLEMENT_ACTIONS[number];

export interface CustomsSupplementDecisionDoc extends mongoose.Document {
 companyId:mongoose.Types.ObjectId;
 declarationId:mongoose.Types.ObjectId;
 fieldPath:string;
 action:CustomsSupplementAction;
 value?:string;
 actorUserId?:mongoose.Types.ObjectId;
 actorEmail?:string;
 reason?:string;
 createdAt:Date;
 updatedAt:Date;
}

const schema=new Schema<CustomsSupplementDecisionDoc>({
 companyId:{type:Schema.Types.ObjectId,required:true,index:true,immutable:true},
 declarationId:{type:Schema.Types.ObjectId,required:true,index:true,immutable:true},
 fieldPath:{type:String,required:true,trim:true,immutable:true},
 action:{type:String,enum:CUSTOMS_SUPPLEMENT_ACTIONS,required:true,immutable:true},
 value:{type:String,trim:true,immutable:true},
 actorUserId:{type:Schema.Types.ObjectId,immutable:true},
 actorEmail:{type:String,trim:true,immutable:true},
 reason:{type:String,trim:true,immutable:true},
},{timestamps:true,versionKey:false});

schema.index({companyId:1,declarationId:1,fieldPath:1,createdAt:1,_id:1});
schema.pre(["updateOne","updateMany","findOneAndUpdate","replaceOne"],function(){throw new Error("Customs supplement decisions are append-only.");});

export const CustomsSupplementDecisionModel:mongoose.Model<CustomsSupplementDecisionDoc> =
 (mongoose.models.CustomsSupplementDecision as mongoose.Model<CustomsSupplementDecisionDoc>|undefined)
 ?? mongoose.model<CustomsSupplementDecisionDoc>("CustomsSupplementDecision",schema);
