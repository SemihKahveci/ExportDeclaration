import assert from 'node:assert/strict';
import {
  buildFaturaAciklamasi,
  buildKapKgLine,
  buildTedarikLine,
  extractTedarikHits,
  isTotalsOnlyAciklama,
  withDenSuffix,
} from './buildFaturaAciklamasi';

assert.equal(
  buildKapKgLine({ totalPackage: 18, grossKg: 1320, netKg: 1184 }),
  'TOPLAM 18 KAP · BRÜT KG: 1.320 · NET KG: 1.184'
);

assert.equal(withDenSuffix('ÖRNEK PLASTİK SAN. A.Ş.'), "ÖRNEK PLASTİK SAN. A.Ş.'DEN");

assert.equal(
  buildTedarikLine([4], 'ÖRNEK PLASTİK SAN. A.Ş.', '1111111111'),
  "4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK SAN. A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111"
);

const htmlLike = buildFaturaAciklamasi({
  header: {},
  parties: {},
  trade: {},
  transport: {},
  packageInfo: { totalPackage: 18, grossKg: 1320, netKg: 1184 },
  goodsLines: [],
  invoiceNotes: [
    "4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK SAN. A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111",
  ],
});
assert.equal(
  htmlLike,
  "4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK SAN. A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111\nTOPLAM 18 KAP · BRÜT KG: 1.320 · NET KG: 1.184"
);

const hits = extractTedarikHits("4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK SAN. A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111");
assert.equal(hits.length, 1);
assert.deepEqual(hits[0]!.lineNos, [4]);
assert.match(hits[0]!.unvan, /ÖRNEK PLASTİK/);
assert.equal(hits[0]!.vergiNo, '1111111111');

// Note’ta tedarik yok → Firma + tüm satırlar ile şablon (HTML gibi 2 satır)
const fromFirma = buildFaturaAciklamasi({
  header: {},
  parties: { seller: { name: 'ÇELİKEL ALÜMİNYUM DÖKÜM İMALAT SAN. VE TİC.A.Ş.', taxNo: '2410053479' } },
  trade: {},
  transport: {},
  packageInfo: { totalPackage: 28, grossKg: 4088.72, netKg: 3290.9 },
  goodsLines: [
    { lineNo: 1, manufacturerType: 'I' },
    { lineNo: 2, manufacturerType: 'I' },
  ],
  invoiceNotes: ['EXW MALLARIMIZ TÜRK MENŞEİLİDİR. TOPLAM KAP : 28 BRÜT KG : 4.088,72 NET KG : 3.290,9 BANKA : ZİRAAT'],
});
assert.equal(
  fromFirma,
  "1.2. SATIRDAKİ ÜRÜNLER ÇELİKEL ALÜMİNYUM DÖKÜM İMALAT SAN. VE TİC.A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 2410053479\nTOPLAM 28 KAP · BRÜT KG: 4.088,72 · NET KG: 3.290,9"
);
assert.doesNotMatch(fromFirma, /BANKA/);

assert.equal(isTotalsOnlyAciklama('TOPLAM 28 KAP - BRÜT KG: 4.088,72 - NET KG: 3.290,9'), true);
assert.equal(isTotalsOnlyAciklama(fromFirma), false);

console.log('buildFaturaAciklamasi.test.ts OK');
