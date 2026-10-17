import assert from "node:assert/strict";
import { discoverInvoiceHeaderPartyFieldCandidates } from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import type { CanonicalDocument, CanonicalLine } from "../../src/modules/idp/domain/canonicalDocument.types.js";

const line = (text: string, y: number, x = .08): CanonicalLine => ({ text, bbox: { x0:x, y0:y, x1:Math.min(.92,x+.55), y1:y+.012 }, source:"NATIVE_TEXT" });
const doc = (lines: CanonicalLine[]): CanonicalDocument => ({
  schemaVersion:"1.0", source:{}, analysis:{contentKind:"DIGITAL",pageCount:1,digitalPageCount:1,scannedPageCount:0,mixedPageCount:0,nativeTextPageCount:1},
  pages:[{pageNumber:1,width:1,height:1,rotation:0,nativeText:lines.map(x=>x.text).join("\n"),nativeCharCount:100,nativeWordCount:30,hasNativeText:true,imageCount:0,imageCoverage:0,contentKind:"DIGITAL",words:[],lines}]
});
const fields = discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("EXPORTER",.05), line("ALPHA INDUSTRIES GMBH",.07), line("Werkstrasse 12",.09), line("Berlin 10115",.11), line("GERMANY",.13),
  line("Firma / Adresse",.22), line("BETA AUTOMOTIVE KFT.",.24), line("Fo utca 73",.26), line("8200 Veszprem",.28), line("HUNGARY",.30),
  line("INVOICE NO: AB123",.38), line("ITEM DESCRIPTION",.45)
]),"segment-001").fields;
assert.equal(fields["parties.seller.name"]?.[0]?.value,"ALPHA INDUSTRIES GMBH");
assert.equal(fields["parties.seller.address"]?.[0]?.value,"Werkstrasse 12, Berlin 10115");
assert.equal(fields["parties.seller.country"]?.[0]?.value,"GERMANY");
assert.equal(fields["parties.buyer.name"]?.[0]?.value,"BETA AUTOMOTIVE KFT.");
assert.equal(fields["parties.buyer.address"]?.[0]?.value,"Fo utca 73, 8200 Veszprem");
assert.equal(fields["parties.buyer.country"]?.[0]?.value,"HUNGARY");

const structuralAddressLabel = discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("BUYER",.05), line("Adresse",.07), line("GAMMA COMPONENTS LTD.",.09), line("Industrial Road 8",.11), line("HUNGARY",.13)
]),"segment-001").fields;
assert.equal(structuralAddressLabel["parties.buyer.name"]?.[0]?.value,"GAMMA COMPONENTS LTD.");
assert.equal(structuralAddressLabel["parties.buyer.address"]?.[0]?.value,"Industrial Road 8");
assert.equal(structuralAddressLabel["parties.buyer.country"]?.[0]?.value,"HUNGARY");

const legacy = discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("Vekmar Elektrik Sist.Yat.ve Tic.A.Ş.",.05), line("8. Cadde İtosb No:7",.07), line("34959 Tepeören / Tuzla/ İSTANBUL",.09),
  line("SAYIN",.18), line("POWER TECHNOLOGY OU",.20), line("Punane 73, Tallinn Harju Maakond, 13619",.22), line("10111 / MAAKOND",.24), line("ESTONYA",.26), line("Malzeme/Hizmet",.36)
]),"segment-001").fields;
assert.equal(legacy["parties.seller.name"]?.[0]?.value,"Vekmar Elektrik Sist.Yat.ve Tic.A.Ş.");
assert.equal(legacy["parties.buyer.name"]?.[0]?.value,"POWER TECHNOLOGY OU");
assert.equal(legacy["parties.buyer.country"]?.[0]?.value,"ESTONYA");

const ambiguous = discoverInvoiceHeaderPartyFieldCandidates(doc([
  line("ALPHA INDUSTRIES GMBH",.05), line("Werkstrasse 12",.07), line("BETA AUTOMOTIVE KFT.",.20), line("Fo utca 73",.22)
]),"segment-001").fields;
assert.equal(ambiguous["parties.seller.name"],undefined);
assert.equal(ambiguous["parties.buyer.name"],undefined);

console.log(JSON.stringify({event:"product-e2e-1.8.49.3.party-address-semantic-authority.contract.passed",acceptance:{explicitExporterBlockAuthoritative:true,explicitFirmaAdresseBuyerBlockAuthoritative:true,explicitPartyAddressesPreserved:true,explicitPartyCountriesPreserved:true,structuralAddressLabelNotPromotedAsPartyName:true,legacySayinLayoutPreserved:true,unlabeledPartyBlocksFailClosed:true},guardrails:{supplierSpecificRules:false,invoiceSpecificConstants:false,fixedColumnCoordinates:false,directNormalizedWrite:false,modelInferenceRequired:false}},null,2));
