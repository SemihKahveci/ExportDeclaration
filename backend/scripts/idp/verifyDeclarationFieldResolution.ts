import assert from "node:assert/strict";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const evidence = (segmentId:string,pageNumber:number) => [{segmentId,pageNumber,contentSource:"NATIVE_TEXT" as const}];
const envelope: DeclarationFieldCandidateEnvelope = {
  version:"1", companyId:"company-1", declarationId:"declaration-1", fields:{
    grossWeight:[
      {candidateId:"gross-invoice",field:"grossWeight",value:101.5,confidence:.94,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-combined",documentType:DocumentType.INVOICE,sourceProcessingRunId:"run-1",evidence:evidence("seg-invoice",2)},
      {candidateId:"gross-packing",field:"grossWeight",value:103,confidence:.97,extractor:"packing",logicalDocumentId:"ld-packing",uploadedFileId:"file-packing",documentType:DocumentType.PACKING_LIST,sourceProcessingRunId:"run-2",evidence:evidence("seg-packing",1)}
    ],
    invoiceNo:[
      {candidateId:"no-invoice",field:"invoiceNo",value:"EXP-42",confidence:.98,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-combined",documentType:DocumentType.INVOICE,sourceProcessingRunId:"run-1",evidence:evidence("seg-invoice",1)},
      {candidateId:"no-packing",field:"invoiceNo",value:"EXP-42",confidence:.90,extractor:"packing",logicalDocumentId:"ld-packing",uploadedFileId:"file-packing",documentType:DocumentType.PACKING_LIST,sourceProcessingRunId:"run-2",evidence:evidence("seg-packing",1)}
    ],
    originCountry:[
      {candidateId:"origin-invoice",field:"originCountry",value:"TR",confidence:.91,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-combined",documentType:DocumentType.INVOICE,sourceProcessingRunId:"run-1",evidence:evidence("seg-invoice",2)},
      {candidateId:"origin-atr",field:"originCountry",value:"DE",confidence:.96,extractor:"atr",logicalDocumentId:"ld-atr",uploadedFileId:"file-combined",documentType:DocumentType.ATR,sourceProcessingRunId:"run-1",evidence:evidence("seg-atr",3)}
    ]
  }
};

const resolved = resolveDeclarationFields({candidates:envelope,rules:[{field:"grossWeight",authority:[
  {priority:10,documentTypes:[DocumentType.PACKING_LIST]},
  {priority:20,documentTypes:[DocumentType.INVOICE]}
]}]});

assert.equal(resolved.companyId,envelope.companyId);
assert.equal(resolved.declarationId,envelope.declarationId);
assert.equal(resolved.fields.invoiceNo.status,"RESOLVED");
assert.equal(resolved.fields.invoiceNo.method,"CONSENSUS");
assert.equal(resolved.fields.grossWeight.status,"RESOLVED");
assert.equal(resolved.fields.grossWeight.method,"CONFIGURED_AUTHORITY");
assert.equal(resolved.fields.grossWeight.value,103);
assert.equal(resolved.fields.grossWeight.selectedCandidate?.logicalDocumentId,"ld-packing");
assert.equal(resolved.fields.grossWeight.selectedCandidate?.uploadedFileId,"file-packing");
assert.equal(resolved.fields.grossWeight.selectedCandidate?.sourceProcessingRunId,"run-2");
assert.equal(resolved.fields.grossWeight.selectedCandidate?.evidence[0]?.segmentId,"seg-packing");
assert.equal(resolved.fields.originCountry.status,"REVIEW_REQUIRED");
assert.equal(resolved.fields.originCountry.reason,"CONFLICT_WITHOUT_AUTHORITY_RULE");
assert.deepEqual(resolved.reviewRequiredFields,["originCountry"]);
assert.equal(resolved.fields.originCountry.selectedCandidate,undefined);

console.log(JSON.stringify({
  event:"foundation-6.5.declaration-field-resolution.passed",
  resolution:{
    fields:Object.keys(resolved.fields).sort(),
    invoiceNo:{status:resolved.fields.invoiceNo.status,method:resolved.fields.invoiceNo.method,value:resolved.fields.invoiceNo.value},
    grossWeight:{status:resolved.fields.grossWeight.status,method:resolved.fields.grossWeight.method,value:resolved.fields.grossWeight.value,selectedLogicalDocumentId:resolved.fields.grossWeight.selectedCandidate?.logicalDocumentId,selectedUploadedFileId:resolved.fields.grossWeight.selectedCandidate?.uploadedFileId,sourceProcessingRunId:resolved.fields.grossWeight.selectedCandidate?.sourceProcessingRunId,evidencePreserved:Boolean(resolved.fields.grossWeight.selectedCandidate?.evidence.length)},
    originCountry:{status:resolved.fields.originCountry.status,reason:resolved.fields.originCountry.reason}
  },
  guardrails:{unconfiguredConflictRequiresReview:true,selectedCandidateProvenancePreserved:true,silentDocumentPrecedence:false}
},null,2));
