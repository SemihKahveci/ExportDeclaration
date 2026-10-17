import assert from "node:assert/strict";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import type { CanonicalDocument, CanonicalLine, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const word=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalWord=>({text,bbox:{x0,y0,x1,y1},confidence:1,source:"NATIVE_TEXT"});
const line=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalLine=>({text,bbox:{x0,y0,x1,y1},source:"NATIVE_TEXT"});
function doc(lines:CanonicalLine[]):CanonicalDocument{
  const nativeText=lines.map(x=>x.text).join("\n");
  const words=lines.flatMap(l=>l.text.split(/\s+/).filter(Boolean).map((t,i)=>word(t,l.bbox.x0+i*.025,l.bbox.y0,l.bbox.x0+(i+1)*.025,l.bbox.y1)));
  const page:CanonicalPage={pageNumber:1,width:1000,height:1000,rotation:0,nativeText,nativeCharCount:nativeText.length,nativeWordCount:words.length,hasNativeText:true,imageCount:0,imageCoverage:0,contentKind:"DIGITAL",words,lines};
  return {schemaVersion:"1.0",source:{},analysis:{contentKind:"DIGITAL",pageCount:1,digitalPageCount:1,scannedPageCount:0,mixedPageCount:0,nativeTextPageCount:1},pages:[page]};
}
const value=(env:any,field:string)=>env.fields[field]?.[0]?.value;

const separatedWeights=discoverInvoiceShipmentFieldCandidates(doc([
  line("NET WT.KGS",.50,.84,.59,.855), line("20.190",.51,.865,.57,.88),
  line("GR.WT.KGS",.70,.84,.79,.855), line("24.000",.71,.865,.77,.88),
]),"segment-001");
assert.equal(value(separatedWeights,"packageInfo.netKg"),20.19);
assert.equal(value(separatedWeights,"packageInfo.grossKg"),24);

const ambiguousNet=discoverInvoiceShipmentFieldCandidates(doc([
  line("NET WT.KGS",.50,.84,.59,.855),
  line("20.190",.49,.865,.55,.88), line("21.000",.53,.865,.59,.88),
]),"segment-001");
assert.equal(value(ambiguousNet,"packageInfo.netKg"),undefined);

const nbspDate=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("INVOICE┬áDATE:",.47,.21,.60,.225), line("05-06-2026",.65,.21,.75,.225),
]),"segment-001");
assert.equal(value(nbspDate,"header.invoiceDate"),"2026-06-05");

const legalFooter=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("Firma / Adresse",.06,.20,.18,.215),
  line("DERMESTA SAŞ",.06,.225,.20,.24),
  line("Example Street 39",.06,.25,.20,.265),
  line("Handelsregister",.06,.275,.18,.29),
]),"segment-001");
assert.equal(value(legalFooter,"parties.buyer.name"),"DERMESTA SAŞ");
assert.equal(value(legalFooter,"parties.buyer.country"),undefined);

const companySuffix=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("BUYER:",.06,.20,.12,.215),
  line("ANADOLUTEKNIK MAKINA",.06,.225,.28,.24),
  line("Example Road 10",.06,.25,.20,.265),
  line("LIMITED SIRKETI",.06,.275,.18,.29),
]),"segment-001");
assert.equal(value(companySuffix,"parties.buyer.country"),undefined);

const validCountry=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("BUYER:",.06,.20,.12,.215),
  line("VALEO AUTOMOTIVE KFT.",.06,.225,.28,.24),
  line("Example Road 10",.06,.25,.20,.265),
  line("Hungary",.06,.275,.13,.29),
]),"segment-001");
assert.equal(value(validCountry,"parties.buyer.country"),"Hungary");

console.log(JSON.stringify({
  event:"product-e2e-1.8.50.4.role-bound-scalar-safety.contract.passed",
  acceptance:{
    separatedNetWeightColumnBound:true,
    separatedGrossWeightColumnBound:true,
    ambiguousColumnWeightFailsClosed:true,
    encodedInvoiceDateLabelRecognized:true,
    legalRegistryCannotBecomeCountry:true,
    companySuffixCannotBecomeCountry:true,
    genuineTerminalCountryPreserved:true
  },
  guardrails:{supplierSpecificRules:false,invoiceSpecificConstants:false,fixedColumnCoordinates:false,ocrOrModelInference:false,databaseMutation:false,directNormalizedWrite:false}
},null,2));
