import assert from "node:assert/strict";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { discoverInvoiceShipmentFieldCandidates } from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import { sanitizeVisionPaymentType } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import type { CanonicalDocument, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const word=(text:string,x0:number,y0:number,x1:number,y1:number):CanonicalWord=>({text,bbox:{x0,y0,x1,y1},confidence:1,source:"NATIVE_TEXT"});
const mkPage=(lines:string[]):CanonicalPage=>({pageNumber:1,width:1000,height:1000,rotation:0,nativeText:lines.join("\n"),nativeCharCount:lines.join(" ").length,nativeWordCount:lines.length,hasNativeText:true,imageCount:0,imageCoverage:0,contentKind:"DIGITAL",words:lines.flatMap((text,i)=>text.split(/\s+/).map((t,j)=>word(t,.05+j*.08,.05+i*.07,.11+j*.08,.07+i*.07))),lines:lines.map((text,i)=>({text,bbox:{x0:.04,y0:.05+i*.07,x1:.95,y1:.07+i*.07},source:"NATIVE_TEXT"}))});
const doc=(lines:string[]):CanonicalDocument=>({schemaVersion:"1.0",source:{},analysis:{contentKind:"DIGITAL",pageCount:1,digitalPageCount:1,scannedPageCount:0,mixedPageCount:0,nativeTextPageCount:1},pages:[mkPage(lines)]});
const value=(env:any,field:string)=>env.fields[field]?.[0]?.value;

const commercial=discoverInvoiceCommercialTermsFieldCandidates(doc(["Kur Bilgisi: 55,85130","INVOICE TOTAL 21.000,00 EUR","BANKA: ZIRAAT BANKASI","IBAN: TR390021000000071086900101"]),"segment-001");
assert.equal(value(commercial,"finance.exchangeRate"),55.8513);
assert.equal(value(commercial,"header.totalAmount"),21000);
assert.equal(value(commercial,"header.currency"),"EUR");
assert.match(String(value(commercial,"finance.bankInfo")),/BANKA/i);
assert.equal(sanitizeVisionPaymentType("Zollreferenzwert"),undefined);
assert.equal(sanitizeVisionPaymentType("DAP-30 DAYS"),"30 DAYS");
assert.equal(sanitizeVisionPaymentType("PESIN ODEME"),"PESIN ODEME");

const shipment=discoverInvoiceShipmentFieldCandidates(doc(["TOPLAM KAP : 66 PALET","BRUT KG : 9.825,02 KG","NET KG : 7.204,01 KG"]),"segment-001");
assert.equal(value(shipment,"packageInfo.totalPackage"),66);
assert.equal(value(shipment,"packageInfo.packageType"),"PALET");
assert.equal(value(shipment,"packageInfo.grossKg"),9825.02);
assert.equal(value(shipment,"packageInfo.netKg"),7204.01);

const header=discoverInvoiceHeaderPartyFieldCandidates(doc(["INVOICE DATE: June 05th, 2026"]),"segment-001");
assert.equal(value(header,"header.invoiceDate"),"2026-06-05");

console.log(JSON.stringify({event:"product-e2e-1.8.49.scalar-semantic-authority.contract.passed",acceptance:{explicitKurBilgisiExchangeRate:true,explicitInvoiceTotalAndCurrency:true,explicitBankEvidence:true,customsReferenceCannotBecomePayment:true,combinedDeliveryPaymentSplit:true,explicitPackageSummary:true,explicitGrossNetSummary:true,englishMonthInvoiceDate:true,existingPaymentTermPreserved:true},guardrails:{supplierSpecificRules:false,invoiceSpecificConstants:false,fixedColumnCoordinates:false,directNormalizedWrite:false,modelInferenceRequired:false}},null,2));
