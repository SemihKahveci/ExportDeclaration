import assert from "node:assert/strict";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import type { CanonicalDocument, CanonicalLine, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const word=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalWord=>({text,bbox:{x0,y0,x1,y1},confidence:1,source:"NATIVE_TEXT"});
const line=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalLine=>({text,bbox:{x0,y0,x1,y1},source:"NATIVE_TEXT"});
function doc(lines:CanonicalLine[]):CanonicalDocument{
  const nativeText=lines.map(x=>x.text).join("\n");
  const words=lines.flatMap(l=>l.text.split(/\s+/).filter(Boolean).map((t,i)=>word(t,l.bbox.x0+i*.02,l.bbox.y0,l.bbox.x0+(i+1)*.02,l.bbox.y1)));
  const page:CanonicalPage={pageNumber:1,width:1000,height:1000,rotation:0,nativeText,nativeCharCount:nativeText.length,nativeWordCount:words.length,hasNativeText:true,imageCount:0,imageCoverage:0,contentKind:"DIGITAL",words,lines};
  return {schemaVersion:"1.0",source:{},analysis:{contentKind:"DIGITAL",pageCount:1,digitalPageCount:1,scannedPageCount:0,mixedPageCount:0,nativeTextPageCount:1},pages:[page]};
}
const value=(env:any,field:string)=>env.fields[field]?.[0]?.value;

const sameRowWeights=discoverInvoiceShipmentFieldCandidates(doc([
  line("NET WT.KGS",.500,.842,.594,.854), line(": 20.190",.613,.842,.669,.855),
  line("GR.WT.KGS",.703,.842,.789,.854), line(": 24.000",.808,.842,.864,.855),
]),"segment-001");
assert.equal(value(sameRowWeights,"packageInfo.netKg"),20.19);
assert.equal(value(sameRowWeights,"packageInfo.grossKg"),24);

const encodedEnglishDate=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("INVOICE┬áDATE:",.477,.210,.597,.225), line("June 05Th,2026",.630,.213,.734,.223),
]),"segment-001");
assert.equal(value(encodedEnglishDate,"header.invoiceDate"),"2026-06-05");

const administrativeTail=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("Firma",.066,.237,.096,.246), line("DERMESTA SAŞ",.162,.236,.254,.246),
  line("Adresse:",.066,.262,.112,.271), line("Adalet Mah. Ma",.162,.262,.256,.271),
  line("İç Kapı No: 3408",.162,.274,.255,.284), line("MERSİS-Nr.: 038",.162,.287,.256,.297),
  line("Handelsregister",.162,.300,.257,.310),
]),"segment-001");
assert.equal(value(administrativeTail,"parties.buyer.country"),undefined);

const legalSuffixContinuation=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("TO:",.093,.155,.115,.169),
  line("ANADOLUTEKNIK MAKINA SANAYI VE DIS TICARET",.155,.183,.476,.193),
  line("LIMITED SIRKETI",.155,.196,.267,.206),
]),"segment-001");
assert.equal(value(legalSuffixContinuation,"parties.buyer.name"),"ANADOLUTEKNIK MAKINA SANAYI VE DIS TICARET LIMITED SIRKETI");
assert.equal(value(legalSuffixContinuation,"parties.buyer.address"),undefined);
assert.equal(value(legalSuffixContinuation,"parties.buyer.country"),undefined);

const separatedPayment=discoverInvoiceCommercialTermsFieldCandidates(doc([
  line("TERM┬áOF┬áPAYMENT:",.093,.233,.235,.248),
  line("30% sent BY TT IN ADVANCE; balance paid before sending goods.",.343,.236,.798,.246),
]),"segment-001");
assert.equal(value(separatedPayment,"trade.paymentType"),"30% sent BY TT IN ADVANCE; balance paid before sending goods.");

const genuineCountry=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("BUYER:",.06,.20,.12,.215), line("VALEO AUTOMOTIVE KFT.",.06,.225,.28,.24),
  line("Example Road 10",.06,.25,.20,.265), line("Hungary",.06,.275,.13,.29),
]),"segment-001");
assert.equal(value(genuineCountry,"parties.buyer.country"),"Hungary");

console.log(JSON.stringify({
  event:"product-e2e-1.8.50.5.2.source-grounded-semantic-boundary.contract.passed",
  acceptance:{
    sameRowSeparatedNetWeightBound:true,
    sameRowSeparatedGrossWeightBound:true,
    encodedEnglishMonthInvoiceDateBound:true,
    administrativeAddressTailCannotBecomeCountry:true,
    legalSuffixContinuesPartyNameNotAddress:true,
    separatedPaymentValueBoundByRoleAndRow:true,
    genuineTerminalCountryPreserved:true
  },
  guardrails:{supplierSpecificRules:false,invoiceSpecificConstants:false,fixedColumnCoordinates:false,ocrOrModelInference:false,databaseMutation:false,directNormalizedWrite:false}
},null,2));
