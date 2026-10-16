import assert from "node:assert/strict";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const candidate=(field:string,value:string)=>({candidateId:`test:${field}`,field,value,confidence:1,extractor:"test",evidence:[{segmentId:"segment-001",pageNumber:1,contentSource:"PAGE_IMAGE" as const}]});
const risky=["transportMode","departureVehicleId","borderVehicleId","vehiclePlate","containerNo","billOfLadingNo","cmrNo","awbNo","transportDocumentNo"];
const input={version:"1" as const,fields:Object.fromEntries(risky.map(f=>[f,[candidate(f,"2")]]))};
const denseTable={version:"1",pages:[{pageNumber:1,width:1,height:1,lines:[],words:[{text:"Item 24 Quantity 2 Unit ADT Price 20.500 EUR",bbox:{x0:0,y0:0,x1:1,y1:.1},source:"NATIVE_TEXT"}]}]} as any;
const rejected=enforceVisionDocumentRoleAuthority(input,denseTable);
for(const field of risky) assert.equal(rejected.fields[field],undefined,`${field} must fail closed without explicit role evidence`);

const explicit={version:"1",pages:[{pageNumber:1,width:1,height:1,lines:[],words:[{text:"Container No: MSKU1234567 CMR No: 7788",bbox:{x0:0,y0:0,x1:1,y1:.1},source:"NATIVE_TEXT"}]}]} as any;
const accepted=enforceVisionDocumentRoleAuthority({version:"1",fields:{containerNo:[candidate("containerNo","MSKU1234567")],cmrNo:[candidate("cmrNo","7788")]}},explicit);
assert.equal(accepted.fields.containerNo?.[0]?.value,"MSKU1234567");
assert.equal(accepted.fields.cmrNo?.[0]?.value,"7788");

console.log(JSON.stringify({event:"product-e2e-1.8.14.role-bound-transport-authority.contract.passed",guardrails:{denseTableQuantityCannotPopulateTransportSlots:true,explicitTransportRoleStillAllowed:true,vendorAgnostic:true,directNormalizedWrite:false}},null,2));
