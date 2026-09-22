import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DocumentType } from "../../src/common/enums/documentType.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationFieldResolutionRunModel } from "../../src/modules/idp/domain/declarationFieldResolution.model.js";
import { resolveAndPersistDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolution.service.js";
import { promotePersistedDeclarationFieldResolution } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";
import type { DeclarationFieldCandidateEnvelope } from "../../src/modules/idp/domain/declarationFieldCandidate.types.js";

const evidence = (segmentId:string,pageNumber:number) => [{segmentId,pageNumber,contentSource:"NATIVE_TEXT" as const}];

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const otherCompanyId = new mongoose.Types.ObjectId();
  const declarationId = new mongoose.Types.ObjectId();
  const run1 = new mongoose.Types.ObjectId();
  const run2 = new mongoose.Types.ObjectId();

  const candidates: DeclarationFieldCandidateEnvelope = {
    version:"1", companyId:String(companyId), declarationId:String(declarationId), fields:{
      invoiceNo:[
        {candidateId:"no-invoice",field:"invoiceNo",value:"EXP-67",confidence:.98,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-invoice",documentType:DocumentType.INVOICE,sourceProcessingRunId:String(run1),evidence:evidence("seg-invoice",1)},
        {candidateId:"no-packing",field:"invoiceNo",value:"EXP-67",confidence:.90,extractor:"packing",logicalDocumentId:"ld-packing",uploadedFileId:"file-packing",documentType:DocumentType.PACKING_LIST,sourceProcessingRunId:String(run2),evidence:evidence("seg-packing",1)}
      ],
      grossWeight:[
        {candidateId:"gross-invoice",field:"grossWeight",value:101.5,confidence:.94,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-invoice",documentType:DocumentType.INVOICE,sourceProcessingRunId:String(run1),evidence:evidence("seg-invoice",2)},
        {candidateId:"gross-packing",field:"grossWeight",value:103,confidence:.97,extractor:"packing",logicalDocumentId:"ld-packing",uploadedFileId:"file-packing",documentType:DocumentType.PACKING_LIST,sourceProcessingRunId:String(run2),evidence:evidence("seg-packing",1)}
      ],
      originCountry:[
        {candidateId:"origin-invoice",field:"originCountry",value:"TR",confidence:.91,extractor:"invoice",logicalDocumentId:"ld-invoice",uploadedFileId:"file-invoice",documentType:DocumentType.INVOICE,sourceProcessingRunId:String(run1),evidence:evidence("seg-invoice",2)},
        {candidateId:"origin-atr",field:"originCountry",value:"DE",confidence:.96,extractor:"atr",logicalDocumentId:"ld-atr",uploadedFileId:"file-invoice",documentType:DocumentType.ATR,sourceProcessingRunId:String(run1),evidence:evidence("seg-atr",3)}
      ]
    }
  };

  try {
    await DeclarationModel.create({
      _id: declarationId,
      companyId,
      status: "DRAFT",
      normalizedData: { trade: { origin: "MANUAL-UNCHANGED" } },
      sourceTrace: { "trade.origin": { value: "MANUAL-UNCHANGED", source: "HUMAN_REVIEW" } }
    });

    const { run } = await resolveAndPersistDeclarationFields({
      companyId, declarationId, candidates,
      rules:[{field:"grossWeight",authority:[
        {priority:10,documentTypes:[DocumentType.PACKING_LIST]},
        {priority:20,documentTypes:[DocumentType.INVOICE]}
      ]}]
    });

    const result = await promotePersistedDeclarationFieldResolution({ companyId, declarationId, resolutionRunId: run._id });
    const persisted = await DeclarationModel.findOne({ _id: declarationId, companyId }).lean();
    assert(persisted);
    const normalized = persisted.normalizedData as any;
    const trace = persisted.sourceTrace as any;

    assert.equal(normalized.header.invoiceNo, "EXP-67");
    assert.equal(normalized.packageInfo.grossKg, 103);
    assert.equal(normalized.trade.origin, "MANUAL-UNCHANGED", "REVIEW_REQUIRED must not overwrite normalizedData");
    assert.equal(trace["trade.origin"].source, "HUMAN_REVIEW", "REVIEW_REQUIRED must not overwrite existing trace");
    assert.equal(trace["packageInfo.grossKg"].candidateId, "gross-packing");
    assert.equal(trace["packageInfo.grossKg"].logicalDocumentId, "ld-packing");
    assert.equal(trace["packageInfo.grossKg"].uploadedFileId, "file-packing");
    assert.equal(trace["packageInfo.grossKg"].sourceProcessingRunId, String(run2));
    assert.equal(trace["packageInfo.grossKg"].evidence[0].segmentId, "seg-packing");
    assert.equal(trace["packageInfo.grossKg"].resolutionRunId, String(run._id));
    assert.deepEqual(result.skippedReviewFields, ["originCountry"]);

    const staleRunId = new mongoose.Types.ObjectId();
    await assert.rejects(
      () => promotePersistedDeclarationFieldResolution({ companyId, declarationId, resolutionRunId: staleRunId }),
      /current resolution run/
    );
    await assert.rejects(
      () => promotePersistedDeclarationFieldResolution({ companyId: otherCompanyId, declarationId, resolutionRunId: run._id }),
      /Declaration not found in company scope/
    );

    console.log(JSON.stringify({
      event:"foundation-6.7.resolved-only-declaration-promotion.passed",
      promotion:{
        promotedFields:result.promotedFields,
        skippedReviewFields:result.skippedReviewFields,
        invoiceNo:normalized.header.invoiceNo,
        grossWeight:normalized.packageInfo.grossKg,
        reviewRequiredValuePreserved:normalized.trade.origin === "MANUAL-UNCHANGED",
        sourceTraceProvenancePreserved:true
      },
      guardrails:{
        reviewRequiredNotPromoted:true,
        existingReviewFieldNotClobbered:true,
        currentResolutionRunRequired:true,
        companyIsolation:true,
        silentReviewWinner:false
      }
    },null,2));
  } finally {
    await DeclarationFieldResolutionRunModel.deleteMany({ declarationId });
    await DeclarationModel.deleteOne({ _id: declarationId });
    await mongoose.disconnect();
  }
}

main().catch((error)=>{ console.error(error); process.exitCode=1; });
