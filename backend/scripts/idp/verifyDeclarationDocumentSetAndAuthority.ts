import assert from "node:assert/strict";
import mongoose from "mongoose";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { buildDeclarationDocumentSet } from "../../src/modules/idp/domain/declarationDocumentSet.js";
import { resolveCrossDocumentField } from "../../src/modules/idp/domain/crossDocumentFieldResolver.js";
import type { CrossDocumentFieldCandidate } from "../../src/modules/idp/domain/crossDocumentFieldResolution.types.js";

const companyId = new mongoose.Types.ObjectId();
const declarationId = new mongoose.Types.ObjectId();
const invoiceId = new mongoose.Types.ObjectId();
const atrId = new mongoose.Types.ObjectId();
const packingId = new mongoose.Types.ObjectId();

function candidate(id:string, field:string, value:unknown, logicalDocumentId:mongoose.Types.ObjectId, documentType:typeof DocumentType[keyof typeof DocumentType]):CrossDocumentFieldCandidate {
  return { candidateId:id, field, value, logicalDocumentId:String(logicalDocumentId), documentType, confidence:.95, evidence:[{segmentId:`segment-${id}`,pageNumber:1,contentSource:"NATIVE_TEXT"}] };
}

const set = buildDeclarationDocumentSet({companyId:String(companyId),declarationId:String(declarationId),logicalDocuments:[
  {_id:invoiceId,uploadedFileId:new mongoose.Types.ObjectId(),type:DocumentType.INVOICE,pageStart:1,pageEnd:2,classificationConfidence:.97},
  {_id:atrId,uploadedFileId:new mongoose.Types.ObjectId(),type:DocumentType.ATR,pageStart:3,pageEnd:3,classificationConfidence:.95},
  {_id:packingId,uploadedFileId:new mongoose.Types.ObjectId(),type:DocumentType.PACKING_LIST,pageStart:1,pageEnd:1,classificationConfidence:.94}
] as any});
assert.equal(set.documents.length,3);
assert.equal(set.roles.INVOICE?.length,1);
assert.equal(set.roles.ATR?.length,1);
assert.equal(set.roles.PACKING_LIST?.length,1);

const consensus = resolveCrossDocumentField("header.invoiceNo",[
  candidate("inv-no","header.invoiceNo","EXP-2026-42",invoiceId,DocumentType.INVOICE),
  candidate("pack-no","header.invoiceNo","EXP-2026-42",packingId,DocumentType.PACKING_LIST)
]);
assert.equal(consensus.status,"RESOLVED");
assert.equal(consensus.method,"CONSENSUS");
assert.equal(consensus.conflict,false);

const unconfiguredConflict = resolveCrossDocumentField("trade.originCountry",[
  candidate("inv-origin","trade.originCountry","TR",invoiceId,DocumentType.INVOICE),
  candidate("atr-origin","trade.originCountry","DE",atrId,DocumentType.ATR)
]);
assert.equal(unconfiguredConflict.status,"REVIEW_REQUIRED");
assert.equal(unconfiguredConflict.reason,"CONFLICT_WITHOUT_AUTHORITY_RULE");

const configured = resolveCrossDocumentField("package.totalPackage",[
  candidate("inv-pack","package.totalPackage",10,invoiceId,DocumentType.INVOICE),
  candidate("packing-pack","package.totalPackage",12,packingId,DocumentType.PACKING_LIST)
],{field:"package.totalPackage",authority:[
  {priority:10,documentTypes:[DocumentType.PACKING_LIST]},
  {priority:20,documentTypes:[DocumentType.INVOICE]}
]});
assert.equal(configured.status,"RESOLVED");
assert.equal(configured.method,"CONFIGURED_AUTHORITY");
assert.equal(configured.value,12);
assert.equal(configured.conflict,true);

const sameTierConflict = resolveCrossDocumentField("trade.deliveryTerm",[
  candidate("inv-term-a","trade.deliveryTerm","FCA",invoiceId,DocumentType.INVOICE),
  candidate("inv-term-b","trade.deliveryTerm","EXW",new mongoose.Types.ObjectId(),DocumentType.INVOICE)
],{field:"trade.deliveryTerm",authority:[{priority:10,documentTypes:[DocumentType.INVOICE]}]});
assert.equal(sameTierConflict.status,"REVIEW_REQUIRED");
assert.equal(sameTierConflict.reason,"CONFLICT_WITHIN_AUTHORITY_TIER");

console.log(JSON.stringify({
  event:"foundation-6.2.declaration-document-set-authority.passed",
  documentSet:{documentCount:set.documents.length,roles:Object.keys(set.roles).sort()},
  cases:[
    {name:"cross-document-consensus",status:consensus.status,method:consensus.method},
    {name:"unconfigured-conflict",status:unconfiguredConflict.status,reason:unconfiguredConflict.reason},
    {name:"configured-authority",status:configured.status,method:configured.method,value:configured.value,conflict:configured.conflict},
    {name:"same-authority-tier-conflict",status:sameTierConflict.status,reason:sameTierConflict.reason}
  ],
  silentPrecedence:false
},null,2));
