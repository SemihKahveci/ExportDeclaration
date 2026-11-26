import assert from 'node:assert/strict';
import { resolveMiktarEdi } from './resolveEvrimMiktar';

const options = [
  { ediKodu: 'C62', label: 'C62 · Adet', aliases: ['C62', 'AD', 'PCS', 'adet', 'Adet'], aciklamaTr: 'AD', cevrimKodu: 'adet' },
  { ediKodu: 'KGM', label: 'KGM · Kilogram', aliases: ['KGM', 'KG', 'kg'], aciklamaTr: 'KG', cevrimKodu: 'kg' },
];

assert.equal(resolveMiktarEdi('C62', options), 'C62');
assert.equal(resolveMiktarEdi('EA', options), 'C62');
assert.equal(resolveMiktarEdi('Adet', options), 'C62');
assert.equal(resolveMiktarEdi('adet', options), 'C62');
assert.equal(resolveMiktarEdi('NIU', options), 'C62');
assert.equal(resolveMiktarEdi('KG', options), 'KGM');
assert.equal(resolveMiktarEdi('—', options), '');
assert.equal(resolveMiktarEdi('XYZ', options), '');

console.log('resolveEvrimMiktar.test.ts OK');
