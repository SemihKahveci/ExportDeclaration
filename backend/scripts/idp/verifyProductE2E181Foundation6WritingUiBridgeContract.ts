import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync("frontend/src/api/adapters/declarationAdapter.ts", "utf8");
const writing = readFileSync("frontend/src/pages/BeyannameYazim/WritingTab.tsx", "utf8");
const declarationApi = readFileSync("frontend/src/api/declarationApi.ts", "utf8");

assert.match(adapter, /mergeNormalizedFromApi\(d\.normalizedData\)/, "writing adapter must consume persisted Declaration.normalizedData");
assert.match(adapter, /fieldValues:\s*toWritingFieldValues\(norm, op\)/, "writing fields must be projected from normalizedData");
assert.match(adapter, /"Fatura No": h\.invoiceNo/, "invoice number must bridge to writing UI");
assert.match(adapter, /"Fatura Tarihi": h\.invoiceDate/, "invoice date must bridge to writing UI");
assert.match(adapter, /"Döviz Cinsi": h\.currency/, "currency must bridge to writing UI");
assert.match(adapter, /"Toplam Fatura Bedeli": h\.totalAmount/, "invoice total must use the actual FIELD_GROUPS key");
assert.match(adapter, /"Teslim Şekli": norm\.trade\.deliveryTerm/, "delivery term must bridge to writing UI");
assert.match(adapter, /"Brüt Kilo": number\(pkg\.grossKg\)/, "gross weight must bridge to writing UI");
assert.match(adapter, /"Net Kilo": number\(pkg\.netKg\)/, "net weight must bridge to writing UI");
assert.match(adapter, /gtip: line\.hsCode/, "Foundation 6 goods hsCode must bridge to writing line items");
assert.match(adapter, /description: line\.description/, "Foundation 6 goods description must bridge to writing line items");
assert.match(adapter, /dovizCinsi: norm\.header\.currency/, "goods rows must inherit persisted declaration currency");
const executableAdapter = adapter
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
assert.doesNotMatch(
  executableAdapter,
  /(?:\.|\[\s*["'])extractedData(?:["']\s*\])?/,
  "writing adapter must not consume raw document extraction output",
);
assert.doesNotMatch(writing, /normalizedData\s*[:=]/, "WritingTab must not write normalizedData directly");
assert.match(declarationApi, /getDeclaration\(id: string\)/, "persisted declaration read API must remain the UI source");

console.log(JSON.stringify({
  event: "product-e2e-1.8.1.foundation6-writing-ui-bridge.contract.passed",
  guardrails: {
    persistedNormalizedDataOnly: true,
    scalarFieldsProjected: true,
    goodsLinesProjected: true,
    fieldGroupKeyAligned: true,
    rawExtractionNotConsumed: true,
    directNormalizedWrite: false,
    foundation6Authoritative: true,
  },
}, null, 2));
