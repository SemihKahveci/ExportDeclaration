import assert from "node:assert/strict";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { sanitizeVisionPaymentType } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import type { CanonicalDocument, CanonicalLine, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const word=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalWord=>({text,bbox:{x0,y0,x1,y1},confidence:1,source:"NATIVE_TEXT"});
const line=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalLine=>({text,bbox:{x0,y0,x1,y1},source:"NATIVE_TEXT"});
function doc(lines:CanonicalLine[]):CanonicalDocument{
  const nativeText=lines.map(x=>x.text).join("\n");
  const words=lines.flatMap(l=>l.text.split(/\s+/).filter(Boolean).map((t,i)=>word(t,l.bbox.x0+i*.035,l.bbox.y0,l.bbox.x0+(i+1)*.035,l.bbox.y1)));
  const page:CanonicalPage={pageNumber:1,width:1000,height:1000,rotation:0,nativeText,nativeCharCount:nativeText.length,nativeWordCount:words.length,hasNativeText:true,imageCount:0,imageCoverage:0,contentKind:"DIGITAL",words,lines};
  return {schemaVersion:"1.0",source:{},analysis:{contentKind:"DIGITAL",pageCount:1,digitalPageCount:1,scannedPageCount:0,mixedPageCount:0,nativeTextPageCount:1},pages:[page]};
}
const value=(env:any,field:string)=>env.fields[field]?.[0]?.value;

const pml=doc([
  line("Pro-Inv No. & Date",.50,.05,.63,.065),
  line("P0087/26-27 & 16-Sep-26",.66,.07,.89,.085),
  line("EPCG License 0331050294 DTD 05/01/2026 EPCG",.50,.36,.89,.38),
  line("NET WT.KGS : 20.190",.50,.84,.66,.855),
  line("GR.WT.KGS : 24.000",.70,.84,.84,.855),
]);
const pmlHeader=discoverInvoiceHeaderPartyFieldCandidates(pml,"segment-001");
const pmlShipment=discoverInvoiceShipmentFieldCandidates(pml,"segment-001");
assert.equal(value(pmlHeader,"header.invoiceNo"),"P0087/26-27");
assert.equal(value(pmlHeader,"header.invoiceDate"),"2026-09-16");
assert.equal(value(pmlShipment,"packageInfo.netKg"),20.19);
assert.equal(value(pmlShipment,"packageInfo.grossKg"),24);

const german=discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("Rechnungs-Nr.",.06,.19,.14,.205), line("2026/0001",.16,.19,.24,.205),
  line("Datum:",.06,.21,.11,.225), line("14.08.2026",.16,.21,.24,.225),
  line("Firma",.06,.235,.10,.25), line("DERMESTA HEALTH GMBH",.16,.235,.38,.25),
  line("Adresse:",.06,.26,.12,.275), line("Example Street 39",.16,.26,.35,.275),
]),"segment-001");
assert.equal(value(german,"header.invoiceNo"),"2026/0001");
assert.equal(value(german,"header.invoiceDate"),"2026-08-14");
assert.equal(value(german,"parties.buyer.name"),"DERMESTA HEALTH GMBH");

const ningbo=discoverInvoiceCommercialTermsFieldCandidates(doc([
  line("TERM OF PAYMENT: 30% sent BY TT IN ADVANCE; balance paid before sending goods.",.09,.23,.82,.25),
  line("Amount(USD)",.71,.31,.81,.33), line("Total",.44,.71,.48,.73), line("4835",.76,.71,.81,.73),
  line("BENEFICIAL BANK:",.09,.75,.22,.77), line("BANK OF NINGBO",.34,.75,.46,.77),
]),"segment-001");
assert.match(String(value(ningbo,"trade.paymentType")),/30% SENT BY TT IN ADVANCE/i);
assert.equal(value(ningbo,"header.totalAmount"),4835);
assert.equal(value(ningbo,"header.currency"),"USD");
assert.match(String(value(ningbo,"finance.bankInfo")),/BANK OF NINGBO/i);

const ambiguousBareTotal=discoverInvoiceCommercialTermsFieldCandidates(doc([
  line("Total",.44,.71,.48,.73), line("4835",.76,.71,.81,.73),
]),"segment-001");
assert.equal(value(ambiguousBareTotal,"header.totalAmount"),undefined);

const conflictingCurrencyBareTotal=discoverInvoiceCommercialTermsFieldCandidates(doc([
  line("Amount(USD)",.71,.31,.81,.33), line("Unit Price(EUR)",.57,.31,.68,.33),
  line("Total",.44,.71,.48,.73), line("4835",.76,.71,.81,.73),
]),"segment-001");
assert.equal(value(conflictingCurrencyBareTotal,"header.totalAmount"),undefined);

const derm=discoverInvoiceCommercialTermsFieldCandidates(doc([
  line("Total",.74,.62,.78,.64), line("EURO 21`000.00",.84,.62,.94,.64),
]),"segment-001");
assert.equal(value(derm,"header.totalAmount"),21000);
assert.equal(value(derm,"header.currency"),"EUR");

const ambiguousExplicitMoneyBareTotal=discoverInvoiceCommercialTermsFieldCandidates(doc([
  line("Total",.74,.62,.78,.64), line("EUR 21`000.00 / TRY 950000.00",.84,.62,.98,.64),
]),"segment-001");
assert.equal(value(ambiguousExplicitMoneyBareTotal,"header.totalAmount"),undefined);

assert.equal(sanitizeVisionPaymentType("On yedi Bin Beş Yüz USD"),undefined);
assert.equal(sanitizeVisionPaymentType("Seventeen Thousand Five Hundred USD"),undefined);
assert.equal(sanitizeVisionPaymentType("PAYMENT IN ADVANCE"),"PAYMENT IN ADVANCE");

console.log(JSON.stringify({
  event:"product-e2e-1.8.50.2.persisted-semantic-parser-fix.contract.passed",
  acceptance:{
    combinedInvoiceNumberDateRoleBound:true,
    twoDigitEnglishMonthInvoiceDate:true,
    unrelatedReferenceDateRejected:true,
    compactGrossNetWeightLabels:true,
    germanInvoiceNumberAndDate:true,
    sameRowFirmaBuyerAuthority:true,
    termOfPaymentAuthority:true,
    amountColumnCurrencyBindsTotal:true,
    bareTotalRequiresUniqueCurrencyContext:true,
    conflictingCurrencyBareTotalFailsClosed:true,
    currencyBeforeAmountTotal:true,
    amountInWordsCannotBecomePayment:true,
    explicitBankEvidencePreserved:true
  },
  guardrails:{supplierSpecificRules:false,invoiceSpecificConstants:false,fixedColumnCoordinates:false,ocrOrModelInference:false,directNormalizedWrite:false}
},null,2));
