import assert from 'node:assert/strict';
import { parseTrNumber } from './parseTrNumber';

assert.equal(parseTrNumber('384'), 384);
assert.equal(parseTrNumber('384,00'), 384);
assert.equal(parseTrNumber('10.710'), 10710);
assert.equal(parseTrNumber('10.710,00'), 10710);
assert.equal(parseTrNumber('8.788,99'), 8788.99);
assert.equal(parseTrNumber('43.509,24 EUR'), 43509.24);
assert.equal(parseTrNumber('22,63'), 22.63);

console.log('parseTrNumber.test.ts OK');
