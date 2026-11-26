import assert from 'node:assert/strict';
import { evaluateExportDownloadGate } from './exportDownloadGate';
import type { BeyannameLineItem } from '../../types';

function line(partial: Partial<BeyannameLineItem>): BeyannameLineItem {
  return {
    lineNo: 1,
    gtip: '1234',
    description: 'x',
    quantity: '1',
    mense: '052',
    brutKg: '1',
    netKg: '1',
    kiymet: '100',
    miktarBirimi: 'C62',
    ...partial,
  };
}

const clean = evaluateExportDownloadGate([line({})], { 'Toplam Fatura Bedeli': '100' });
assert.equal(clean.issues.length, 0);
assert.equal(clean.blocking, false);

const missing = evaluateExportDownloadGate(
  [line({ miktarBirimi: '', mense: '—' })],
  { 'Toplam Fatura Bedeli': '100' }
);
assert.equal(missing.blocking, true);
assert.equal(missing.allowForce, false);
assert.ok(missing.issues.some((i) => i.kind === 'unit'));
assert.ok(missing.issues.some((i) => i.kind === 'mense'));

const totalOnly = evaluateExportDownloadGate(
  [line({ kiymet: '120' })],
  { 'Toplam Fatura Bedeli': '100' }
);
assert.equal(totalOnly.blocking, false);
assert.equal(totalOnly.allowForce, true);
assert.equal(totalOnly.issues.length, 1);
assert.equal(totalOnly.issues[0]?.kind, 'total');

console.log('exportDownloadGate.test.ts OK');
