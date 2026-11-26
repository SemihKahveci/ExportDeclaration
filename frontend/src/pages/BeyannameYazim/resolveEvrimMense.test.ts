import assert from 'node:assert/strict';
import { resolveMenseUlkeNo } from './resolveEvrimMense';

// Excel Mense satırı: Ulke_Kodu=CN, Ulke=ÇİN…, YUlke=CHINA, SBUlke=Çin
const options = [
  {
    ulkeNo: '720',
    label: '720 · ÇİN HALK CUMHURİYETİ',
    ulkeKodu: 'CN',
    ulke: 'ÇİN HALK CUMHURİYETİ',
    yUlke: 'CHINA',
    aliases: ['720', 'CN', 'ÇİN HALK CUMHURİYETİ', 'CHINA', 'Çin'],
  },
  {
    ulkeNo: '001',
    label: '001 · FRANSA',
    ulkeKodu: 'FR',
    ulke: 'FRANSA',
    yUlke: 'FRANCE',
    aliases: ['001', 'FR', 'FRANSA', 'FRANCE'],
  },
];

assert.equal(resolveMenseUlkeNo('CHINA', options), '720');
assert.equal(resolveMenseUlkeNo('China', options), '720');
assert.equal(resolveMenseUlkeNo('CN', options), '720');
assert.equal(resolveMenseUlkeNo('720', options), '720');
assert.equal(resolveMenseUlkeNo('FRANCE', options), '001');
assert.equal(resolveMenseUlkeNo('—', options), '');
assert.equal(resolveMenseUlkeNo('CHINA', []), '');

console.log('resolveEvrimMense.test.ts OK');
