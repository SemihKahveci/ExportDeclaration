import assert from "node:assert/strict";
import { applyNoteShipmentRules, parseTrNoteNumber } from "../../src/modules/extraction/ubl/ublIhracatNoteRules.js";
import type { UblParsedInvoice } from "../../src/modules/extraction/ubl/ublIhracatInvoice.types.js";

assert.equal(parseTrNoteNumber("9.825,02"), 9825.02);
assert.equal(parseTrNoteNumber("7.204,01"), 7204.01);
assert.equal(parseTrNoteNumber("24.900"), 24900);
assert.equal(parseTrNoteNumber("472,00"), 472);

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

console.log("ubl note shipment rules ok");
