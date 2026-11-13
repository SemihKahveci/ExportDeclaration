/**
 * Root-cause contracts for Maçin/PAG gaps observed on real reruns:
 * - KAP ADEDİ (İ→I → ADEDI) must yield count + PALET type
 * - 7.190 / 34.000 weight tokens are thousands, not decimals
 * - TACİKİSTAN / DUBAİ / TR domestic address → ISO countries
 */
import assert from "node:assert/strict";
import {
  discoverInvoiceHeaderPartyFieldCandidates,
  inferTurkeyFromDomesticAddress,
  partyCountryValue,
} from "../../src/modules/idp/candidates/invoiceHeaderPartyCandidateDiscovery.js";
import {
  discoverInvoiceShipmentFieldCandidates,
  packageTypeFromCountEvidence,
  parseShipmentNumber,
} from "../../src/modules/idp/candidates/invoiceShipmentCandidateDiscovery.js";
import { canonicalizeVisionCountry } from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";
import type { CanonicalDocument, CanonicalPage, CanonicalWord } from "../../src/modules/idp/domain/canonicalDocument.types.js";

assert.equal(parseShipmentNumber("7.190"), 7190);
assert.equal(parseShipmentNumber("34.000"), 34000);
assert.equal(parseShipmentNumber("7,19"), 7.19);
assert.equal(packageTypeFromCountEvidence("KAP ADEDI: 12 PALET(46 VARIL)"), "PALET");
assert.equal(canonicalizeVisionCountry("TACİKİSTAN"), "TJ");
assert.equal(canonicalizeVisionCountry("DUBAİ"), "AE");
assert.equal(partyCountryValue("TACİKİSTAN,BUSTON ŞEHRİ, ROKHİ OBOD ST.1"), "TJ");
assert.equal(partyCountryValue("DUBAİ"), "AE");
assert.equal(
  inferTurkeyFromDomesticAddress("CEVİZLİ MAH. ULUBEY SK. NÜRSALLAR SİT. A BLOK, NO:4A/113 34865 KARTAL İSTANBUL"),
  "TR",
);
assert.equal(inferTurkeyFromDomesticAddress("34104 Zeytinburnu/ İstanbul"), "TR");
assert.equal(inferTurkeyFromDomesticAddress("Punane 73 Tallinn"), undefined);

const word = (text: string, x0: number, y0: number, x1 = x0 + 0.08, y1 = y0 + 0.015): CanonicalWord => ({
  text, bbox: { x0, y0, x1, y1 }, confidence: 1, source: "NATIVE_TEXT",
});
const mkPage = (lines: string[]): CanonicalPage => ({
  pageNumber: 1, width: 1000, height: 1000, rotation: 0,
  nativeText: lines.join("\n"),
  nativeCharCount: lines.join(" ").length,
  nativeWordCount: lines.length,
  hasNativeText: true, imageCount: 0, imageCoverage: 0, contentKind: "DIGITAL",
  words: lines.flatMap((text, i) =>
    text.split(/\s+/).map((t, j) => word(t, 0.05 + j * 0.06, 0.05 + i * 0.06))),
  lines: lines.map((text, i) => ({
    text, bbox: { x0: 0.04, y0: 0.05 + i * 0.06, x1: 0.95, y1: 0.07 + i * 0.06 }, source: "NATIVE_TEXT",
  })),
});
const doc = (lines: string[]): CanonicalDocument => ({
  schemaVersion: "1.0",
  source: {},
  analysis: {
    contentKind: "DIGITAL", pageCount: 1, digitalPageCount: 1, scannedPageCount: 0,
    mixedPageCount: 0, nativeTextPageCount: 1,
  },
  pages: [mkPage(lines)],
});
const value = (env: { fields: Record<string, Array<{ value: unknown }>> }, field: string) =>
  env.fields[field]?.[0]?.value;

const pagNotes = discoverInvoiceShipmentFieldCandidates(doc([
  "Not: NET KG: 5.980KG, BRÜT KG: 7.190KG, KAP ADEDİ: 12 PALET(46 VARİL)",
]), "seg");
assert.equal(value(pagNotes, "packageInfo.totalPackage"), 12);
assert.equal(value(pagNotes, "packageInfo.packageType"), "PALET");
assert.equal(value(pagNotes, "packageInfo.grossKg"), 7190);
assert.equal(value(pagNotes, "packageInfo.netKg"), 5980);

const pag10 = discoverInvoiceShipmentFieldCandidates(doc([
  "Not: NET:34.000 KG,BÜRÜT:35.360 KG,KAP ADEDİ: MS 200.",
]), "seg");
assert.equal(value(pag10, "packageInfo.netKg"), 34000);
assert.equal(value(pag10, "packageInfo.grossKg"), 35360);
assert.equal(value(pag10, "packageInfo.totalPackage"), 200);

const parties = discoverInvoiceHeaderPartyFieldCandidates(doc([
  "PAG KİMYA SAN. TİC. LTD. ŞTİ.",
  "CEVİZLİ MAH. ULUBEY SK. NÜRSALLAR SİT. A BLOK",
  "NO:4A/113 34865 KARTAL İSTANBUL",
  "SAYIN",
  "MERİT KİMYASALLAR",
  "TACİKİSTAN,BUSTON ŞEHRİ, ROKHİ OBOD ST.1",
  "PARTİ TÜRÜ : İHRACAT",
  "MALZEME",
]), "seg");
assert.equal(value(parties, "parties.seller.country"), "TR");
assert.equal(value(parties, "parties.buyer.country"), "TJ");

const dubai = discoverInvoiceHeaderPartyFieldCandidates(doc([
  "PAG KİMYA SAN. TİC. LTD. ŞTİ.",
  "CEVİZLİ MAH. ULUBEY SK. 34865 KARTAL İSTANBUL",
  "SAYIN",
  "NADİR REÇİNE VE KİMYASAL SANAYİLERİ LLC.",
  "DUBAİ",
  "PARTİ TÜRÜ : İHRACAT",
  "MALZEME",
]), "seg");
assert.equal(value(dubai, "parties.buyer.country"), "AE");

console.log("verifyMacinPagPartyShipmentLift: ok");
