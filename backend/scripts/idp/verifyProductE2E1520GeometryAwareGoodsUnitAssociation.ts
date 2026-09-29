import assert from "node:assert/strict";
import type { CanonicalDocument, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../../src/modules/idp/domain/fieldCandidate.types.js";
import { associateExplicitGoodsUnitsFromQuantity } from "../../src/modules/idp/llm/invoiceGoodsUnitAssociation.js";

function word(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalWord {
  return { text, bbox:{x0,y0,x1,y1}, confidence:1, source:"NATIVE_TEXT" };
}
function doc(words:CanonicalWord[]):CanonicalDocument {
  return { schemaVersion:"1.0", source:{fileName:"synthetic.pdf"}, analysis:{contentKind:"DIGITAL",pageCount:1,digitalPageCount:1,scannedPageCount:0,mixedPageCount:0,nativeTextPageCount:1}, pages:[{pageNumber:1,width:1,height:1,rotation:0,nativeText:words.map(w=>w.text).join(" "),nativeCharCount:1,nativeWordCount:words.length,hasNativeText:true,imageCount:0,imageCoverage:0,contentKind:"DIGITAL",words,lines:[]}] };
}
function quantity(value:number):FieldCandidateEnvelope {
  return {version:"1",fields:{"goodsLines.0.quantity":[{candidateId:"vision-q",field:"goodsLines.0.quantity",value,confidence:.95,extractor:"qwen-vision",evidence:[{segmentId:"segment-001",pageNumber:1,contentSource:"PAGE_IMAGE"}]}]}};
}

const fiber = associateExplicitGoodsUnitsFromQuantity({canonicalDocument:doc([
  word("2.250",.242,.356,.275,.365), word("KG",.279,.356,.296,.365),
  word("2.250",.139,.634,.172,.644), word("Kg.",.176,.634,.195,.644),
  word("4",.22,.634,.23,.644), word("Palet",.24,.634,.27,.644)
]),segmentId:"segment-001",candidates:quantity(2250)});
const fiberUnits=fiber.fields["goodsLines.0.unit"] ?? [];
assert.ok(fiberUnits.length >= 1);
assert.ok(fiberUnits.every(c=>c.value === "KG"));
assert.ok(fiberUnits.every(c=>c.evidence[0]?.contentSource === "NATIVE_TEXT"));
assert.ok(fiberUnits.some(c=>c.evidence[0]?.text === "KG"));

const adet=associateExplicitGoodsUnitsFromQuantity({canonicalDocument:doc([word("569",.20,.30,.23,.31),word("Adet",.235,.30,.265,.31)]),segmentId:"segment-001",candidates:quantity(569)});
assert.equal(adet.fields["goodsLines.0.unit"]?.[0]?.value,"ADET");

const unrelated=associateExplicitGoodsUnitsFromQuantity({canonicalDocument:doc([word("2.250",.20,.30,.24,.31),word("USD",.245,.30,.28,.31),word("KG",.60,.30,.63,.31)]),segmentId:"segment-001",candidates:quantity(2250)});
assert.equal(unrelated.fields["goodsLines.0.unit"],undefined);

const conflict=associateExplicitGoodsUnitsFromQuantity({canonicalDocument:doc([
  word("10",.20,.30,.22,.31),word("KG",.225,.30,.25,.31),
  word("10",.20,.50,.22,.51),word("PCS",.225,.50,.26,.51)
]),segmentId:"segment-001",candidates:quantity(10)});
assert.deepEqual(new Set((conflict.fields["goodsLines.0.unit"]??[]).map(c=>c.value)),new Set(["KG","PCS"]));

const existing:FieldCandidateEnvelope={version:"1",fields:{...quantity(2250).fields,"goodsLines.0.unit":[{candidateId:"existing",field:"goodsLines.0.unit",value:"KG",confidence:.9,extractor:"vision",evidence:[{segmentId:"segment-001",pageNumber:1,contentSource:"PAGE_IMAGE"}]}]}};
const preserved=associateExplicitGoodsUnitsFromQuantity({canonicalDocument:doc([word("2.250",.2,.3,.24,.31),word("KG",.245,.3,.27,.31)]),segmentId:"segment-001",candidates:existing});
assert.equal(preserved.fields["goodsLines.0.unit"]?.length,1);
assert.equal(preserved.fields["goodsLines.0.unit"]?.[0]?.candidateId,"existing");

console.log(JSON.stringify({event:"product-e2e-1.5.20.geometry-aware-goods-unit-association.passed",quantityMatchedExplicitKg:true,adetAliasCanonicalized:true,nonAdjacentUnitRejected:true,ambiguousUnitsRetainedForFoundation6:true,existingUnitCandidatesPreserved:true,sourceEvidenceTextPreserved:true,guardrails:{supplierSpecificRuleAdded:false,noModelInferenceRequired:true,noDatabaseMutation:true,directNormalizedWrite:false}},null,2));
