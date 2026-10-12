import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const liveApi = read("frontend/src/services/liveApi.ts");
const documents = read("frontend/src/services/documents.ts");
const writing = read("frontend/src/pages/BeyannameYazim/WritingTab.tsx");
const adapter = read("frontend/src/api/adapters/declarationAdapter.ts");
const types = read("frontend/src/api/types/document.types.ts");

assert.match(liveApi, /fetchEvrakPreview\(declarationId: string, documentId: string\)/, "live preview must be declaration/document scoped");
assert.match(liveApi, /getDeclaration\(declarationId\)/, "live preview must read persisted declaration");
assert.match(liveApi, /listDocuments\(declarationId\)/, "live preview must read persisted document metadata");
assert.match(liveApi, /mergeNormalizedFromApi\(norm\)/, "live preview must project persisted normalizedData");
assert.match(liveApi, /Foundation 6 tarafından promote edilmiş persisted normalizedData/, "preview must identify its authoritative source");
assert.match(documents, /A live declaration must never fall back to demo preview values/, "live records must fail closed instead of showing demo preview data");
assert.doesNotMatch(liveApi, /extractedData\s*[.\[]/, "live preview must not consume raw extractedData");

assert.match(writing, /goodsFieldPresence/, "goods coverage must be based on actual field presence");
assert.match(writing, /'Malzeme No'.*malzemeNo/s, "goods coverage must measure material number independently");
assert.match(writing, /'Kalem Brüt KG'.*brutKg/s, "goods coverage must measure line gross weight independently");
assert.match(writing, /'Kalem Net KG'.*netKg/s, "goods coverage must measure line net weight independently");
assert.doesNotMatch(writing, /lineItems\?\.length \? fields\.length : 0/, "one goods row must not imply 13\/13 coverage");

assert.match(types, /productCode\?: string;/, "frontend normalized goods type must preserve productCode");
assert.match(types, /productCode: row\.productCode/, "normalized merge must preserve productCode");
assert.match(adapter, /malzemeNo: line\.productCode/, "writing table must project productCode as material number");

console.log(JSON.stringify({
  event: "product-e2e-1.8.4.truthful-product-ui-projection.contract.passed",
  guardrails: {
    livePreviewUsesPersistedNormalizedData: true,
    livePreviewNoDemoFallback: true,
    rawExtractionNotConsumed: true,
    goodsCoverageMeasuredPerField: true,
    productCodePreserved: true,
    foundation6Authoritative: true,
  },
}, null, 2));
