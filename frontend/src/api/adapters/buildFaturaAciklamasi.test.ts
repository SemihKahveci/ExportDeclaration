import assert from 'node:assert/strict';
import { buildFaturaAciklamasi, buildKapKgLine } from './buildFaturaAciklamasi';

assert.equal(
  buildKapKgLine({ totalPackage: 18, grossKg: 1320, netKg: 1184 }),
  'TOPLAM 18 KAP - BRÜT KG: 1.320 - NET KG: 1.184'
);

const fromNotes = buildFaturaAciklamasi({
  header: {},
  parties: {},
  trade: {},
  transport: {},
  packageInfo: {},
  goodsLines: [],
  invoiceNotes: [
    "4. SATIRDAKİ ÜRÜNLER ÖRNEK PLASTİK SAN. A.Ş.'DEN TEDARİK EDİLMİŞTİR. VERGİ NO: 1111111111",
    'TOPLAM 18 KAP - BRÜT KG: 1.320 - NET KG: 1.184',
  ],
});
assert.match(fromNotes, /SATIRDAKİ ÜRÜNLER/);
assert.match(fromNotes, /VERGİ NO: 1111111111/);
assert.match(fromNotes, /TOPLAM 18 KAP/);

const synthesized = buildFaturaAciklamasi({
  header: {},
  parties: { seller: { name: 'ÇELİKEL ALÜMİNYUM', taxNo: '2410053479' } },
  trade: {},
  transport: {},
  packageInfo: { totalPackage: 66, grossKg: 9825.02, netKg: 7204.01 },
  goodsLines: [],
});
assert.match(synthesized, /TOPLAM 66 KAP/);
assert.match(synthesized, /BRÜT KG: 9\.825/);
assert.match(synthesized, /2410053479/);

const notesWithoutTotals = buildFaturaAciklamasi({
  header: {},
  parties: {},
  trade: {},
  transport: {},
  packageInfo: { totalPackage: 2, grossKg: 472, netKg: 442 },
  goodsLines: [],
  invoiceNotes: ['MALLARIMIZ TÜRK MENŞEİLİDİR.'],
});
assert.match(notesWithoutTotals, /MALLARIMIZ TÜRK/);
assert.match(notesWithoutTotals, /TOPLAM 2 KAP/);

console.log('buildFaturaAciklamasi.test.ts OK');
