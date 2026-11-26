import assert from 'node:assert/strict';
import {
  buildFaturaAciklamasi,
  buildKapKgLine,
  buildTedarikLine,
  extractTedarikHits,
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

// Uzun Celikel note (TR menşe) → yalnızca kap/kilo satırı; banka/mersis yok
const celikel = buildFaturaAciklamasi({
  header: {},
  parties: { seller: { name: 'ÇELİKEL ALÜMİNYUM DÖKÜM İMALAT SAN. VE TİC.A.Ş.', taxNo: '2410053479' } },
  trade: {},
  transport: {},
  packageInfo: { totalPackage: 66, grossKg: 9825.02, netKg: 7204.01 },
  goodsLines: [{ lineNo: 1, manufacturerType: 'I' }, { lineNo: 2, manufacturerType: 'I' }],
  invoiceNotes: [
    'EXW MALLARIMIZ TÜRK MENŞEİLİDİR. TOPLAM KAP : 66 PALET BRÜT KG : 9.825,02 NET KG : 7.204,01 BANKA : ZİRAAT',
  ],
});
assert.equal(celikel, 'TOPLAM 66 KAP · BRÜT KG: 9.825,02 · NET KG: 7.204,01');
assert.doesNotMatch(celikel, /BANKA/);
assert.doesNotMatch(celikel, /TEDARİK/);

console.log('buildFaturaAciklamasi.test.ts OK');
