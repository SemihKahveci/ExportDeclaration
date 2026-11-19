import assert from "node:assert/strict";
import {
  applyNoteOriginRules,
  applyNoteShipmentRules,
  enrichInvoiceFromNotes,
  parseTrNoteNumber,
} from "../../src/modules/extraction/ubl/ublIhracatNoteRules.js";
import type { UblParsedInvoice } from "../../src/modules/extraction/ubl/ublIhracatInvoice.types.js";

assert.equal(parseTrNoteNumber("9.825,02"), 9825.02);
assert.equal(parseTrNoteNumber("7.204,01"), 7204.01);
assert.equal(parseTrNoteNumber("24.900"), 24900);
assert.equal(parseTrNoteNumber("472,00"), 472);
assert.equal(parseTrNoteNumber("12.338,50,"), 12338.5);

const celikel: UblParsedInvoice = {
  invoiceNotes: [
    "ALTMIŞBİRBİNONBİR EUR VE DOKSANSEKİZ CENT Ticaret Sicil No : 105851 MERSİS No : 9678187434985368 EXW MALLARIMIZ TÜRK MENŞEİLİDİR. TOPLAM KAP : 66 PALET BRÜT KG : 9.825,02 NET KG : 7.204,01 BANKA : ZİRAAT BANKASI GEBZE KURUMSAL ŞUBE ÖDEME ŞEKLİ : MAL MUKABİLİ ------------------------------------",
  ],
  goodsLines: [],
};

const enriched = applyNoteShipmentRules(celikel);
assert.equal(enriched.totalPackage, 66);
assert.equal(enriched.grossKg, 9825.02);
assert.equal(enriched.netKg, 7204.01);
assert.equal(enriched.packageType, "PALET");
assert.equal(enriched.deliveryTerm, "EXW");
assert.equal(enriched.paymentType, "MAL MUKABİLİ");
assert.match(String(enriched.bankInfo ?? ""), /ZİRAAT/i);
assert.ok(!String(enriched.paymentType ?? "").includes("BANKA"));

const vekmar: UblParsedInvoice = {
  invoiceNotes: [
    "TOPLAM KAP:2",
    "TOPLAM BRÜT AĞIRLIK:472,00 KG",
    "TOPLAM NET AĞIRLIK:442,00 KG",
  ],
  goodsLines: [],
  packageType: "BI",
};
const v = applyNoteShipmentRules(vekmar);
assert.equal(v.totalPackage, 2);
assert.equal(v.grossKg, 472);
assert.equal(v.netKg, 442);
assert.equal(v.packageType, "BI");

const vekmarBroken: UblParsedInvoice = {
  invoiceNotes: [
    "TOPLAM KAP:2",
    "TOPLAM BR\uFFFDT A\uFFFDIRLIK:472,00 KG",
    "TOPLAM NET A\uFFFDIRLIK:442,00 KG",
    "PE\uFFFD\uFFFDN \uFFFDDEME",
  ],
  goodsLines: [],
  packageType: "BI",
};
const vb = applyNoteShipmentRules(vekmarBroken);
assert.equal(vb.grossKg, 472);
assert.equal(vb.netKg, 442);
assert.equal(vb.paymentType, "PEŞİN");

const evax: UblParsedInvoice = {
  invoiceNotes: [
    "ÖDEME ŞEKLİ:PEŞİN",
    "TESLİM ŞEKLİ:EXW",
    "TAŞIMA ŞEKLİ:KARAYOLU",
    "ARACI BANKA:YAPI KREDİ BANKASI SERDİVAN ŞUBESİ",
    "BRÜT AĞIRLIK :2676,00",
    "NET AĞIRLIK :2500,00",
    "KAP ADEDİ:94",
  ],
  goodsLines: [],
  packageType: "BX",
};
const e = applyNoteShipmentRules(evax);
assert.equal(e.paymentType, "PEŞİN");
assert.match(String(e.bankInfo ?? ""), /YAPI KREDİ/i);
assert.equal(e.grossKg, 2676);
assert.equal(e.netKg, 2500);
assert.equal(e.totalPackage, 94);

const makro: UblParsedInvoice = {
  invoiceNotes: [
    "ÖDEME ŞEKLİ: PEŞİN",
    "BANKA:ZİRAAT BANKASI ŞUBE : İSTANBUL GİRİŞİMCİ TUZLA OSB",
    "KAP ADEDİ: 200, NET KG 11.590,BRÜT KG:12.338,50,TESLİM ŞEKLİ: EXW",
  ],
  goodsLines: [],
};
const m = applyNoteShipmentRules(makro);
assert.equal(m.paymentType, "PEŞİN");
assert.match(String(m.bankInfo ?? ""), /ZİRAAT/i);
assert.equal(m.totalPackage, 200);
assert.equal(m.netKg, 11590);
assert.equal(m.grossKg, 12338.5);

const adin: UblParsedInvoice = {
  invoiceNotes: [
    "#ODEMESEKLI|50-PEŞİN",
    "MENŞEİ:TÜRKİYE",
    "NET KG:6400",
    "BRÜT KG:7120",
    "PALET SAYISI:8",
    "ÖDEME ŞEKLİ:PEŞİN",
    "ŞEKERBANK SİLİVRİ ŞUB.",
  ],
  goodsLines: [{ lineNo: 1 }, { lineNo: 2 }, { lineNo: 3 }, { lineNo: 4 }],
};
const a = enrichInvoiceFromNotes(adin);
assert.equal(a.totalPackage, 8);
assert.equal(a.packageType, "PALET");
assert.equal(a.grossKg, 7120);
assert.equal(a.netKg, 6400);
assert.equal(a.paymentType, "PEŞİN");
assert.match(String(a.bankInfo ?? ""), /ŞEKERBANK/i);
assert.equal(a.goodsLines[0]?.origin, "TÜRKİYE");
assert.equal(a.goodsLines[0]?.packageType, "PALET");

const pag: UblParsedInvoice = {
  invoiceNotes: [
    "GARANTİ BANKASI A.Ş./KARTAL ŞUBESİ ,ÖDEME ŞEKLİ:PEŞİN",
  ],
  goodsLines: [],
};
const p = applyNoteShipmentRules(pag);
assert.equal(p.paymentType, "PEŞİN");
assert.match(String(p.bankInfo ?? ""), /GARANTİ BANKASI/i);

const coklu: UblParsedInvoice = {
  invoiceNotes: ["1 VE 3 NOLU KALEMLER TÜRKİYE, DİĞERLERİ ALMANYA MENŞEİLİDİR"],
  goodsLines: [{ lineNo: 1 }, { lineNo: 2 }, { lineNo: 3 }, { lineNo: 4 }],
};
const c = applyNoteOriginRules(coklu);
assert.deepEqual(
  c.goodsLines.map((line) => line.origin),
  ["TÜRKİYE", "ALMANYA", "TÜRKİYE", "ALMANYA"]
);

console.log("ubl note shipment rules ok");
