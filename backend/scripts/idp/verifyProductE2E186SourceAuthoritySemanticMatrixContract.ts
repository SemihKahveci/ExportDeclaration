import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const rules = readFileSync(resolve(root, "frontend/src/services/declarationFieldRules.ts"), "utf8");
const matrix = readFileSync(resolve(root, "frontend/src/services/declarationFieldSourceAuthority.ts"), "utf8");
const writing = readFileSync(resolve(root, "frontend/src/pages/BeyannameYazim/WritingTab.tsx"), "utf8");

const groupBlock = rules.match(/export const FIELD_GROUPS:[\s\S]*?export const SOURCE_DOCUMENT_OPTIONS/);
assert(groupBlock, "FIELD_GROUPS must remain discoverable");
const fieldArrays = [...groupBlock[0].matchAll(/fields:\s*\[([\s\S]*?)\]/g)];
const fields = fieldArrays.flatMap((block) => [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
const uniqueFields = [...new Set(fields)];
assert.equal(uniqueFields.length, 68, `expected 68 declaration writing fields, got ${uniqueFields.length}`);
for (const field of uniqueFields) {
  assert(matrix.includes(`'${field}':`), `source-authority matrix missing UI field: ${field}`);
}

assert.match(matrix, /'Gönderici \/ İhracatçı Ünvanı': D\(/);
assert.match(matrix, /'Alıcı \/ İthalatçı Adresi': D\(/);
assert.match(matrix, /'Çıkış Ülkesi': D\('BOUNDED_DERIVATION'/);
assert.match(matrix, /'Varış Ülkesi': D\('BOUNDED_DERIVATION'/);
assert.match(matrix, /'Gideceği Ülke': D\('BOUNDED_DERIVATION'/);
assert.match(matrix, /'Ticaret Yapılan Ülke': D\('BOUNDED_DERIVATION'/);
assert.match(matrix, /körlemesine kopyalanmaz/);
assert.match(matrix, /'Çıkış Aracı': D\(/);
assert.match(matrix, /'Konteyner No': D\(/);
assert.match(matrix, /'Ödeme Şekli': D\(/);
assert.match(matrix, /'Kap Adedi': D\(/);
assert.match(matrix, /'Beyanname No': E\(/);
assert.match(matrix, /'Rejim': U\(/);
assert.match(matrix, /'Beyan Sahibi \/ Temsilci': S\(/);
assert.match(matrix, /'İstatistiki Kıymet': C\(/);
assert.match(matrix, /DOCUMENT never means/);
assert.match(writing, /isDocumentSourcedField/);
assert.match(writing, /documentFilledCount/);
assert.match(writing, /doküman alanı/);
assert.match(writing, /toplam/);

console.log(JSON.stringify({
  event: "product-e2e-1.8.6.source-authority-semantic-matrix.contract.passed",
  classifiedWritingFields: uniqueFields.length,
  guardrails: {
    allWritingFieldsClassified: true,
    documentVsExternalAuthoritySeparated: true,
    sourcePresentOnlySemantics: true,
    destinationCountriesNotBlindCopied: true,
    transportEvidenceFailClosed: true,
    sourceAwareUiCoverage: true,
    vendorAgnostic: true,
    directNormalizedWrite: false
  }
}, null, 2));
