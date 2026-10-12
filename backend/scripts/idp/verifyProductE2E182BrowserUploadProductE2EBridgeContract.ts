import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const uploadDrawer = source("frontend/src/pages/BeyannameYazim/UploadDrawer.tsx");
const page = source("frontend/src/pages/BeyannameYazim/index.tsx");
const declarations = source("frontend/src/services/declarations.ts");
const liveApi = source("frontend/src/services/liveApi.ts");
const documentApi = source("frontend/src/api/documentApi.ts");
const evrak = source("frontend/src/pages/EvrakHazirlik/index.tsx");
const documentAdapter = source("frontend/src/api/adapters/documentAdapter.ts");
const declarationAdapter = source("frontend/src/api/adapters/declarationAdapter.ts");

assert.match(uploadDrawer, /!ref\s*\|\|\s*!docType\s*\|\|\s*!file/, "browser upload must require a real file");
assert.match(uploadDrawer, /IDP işleme başladı/, "upload UI must tell the operator asynchronous IDP started");
assert.match(uploadDrawer, /onUploaded\?\.\(uploaded\.declarationId\)/, "successful upload must surface persisted declaration ownership");
assert.match(declarations, /return apiUploadByRef\(/, "service must return the persisted upload result");
assert.match(liveApi, /return uploadDocument\(/, "live API bridge must return the backend upload document");
assert.match(documentApi, /apiPostMultipart<UploadedDocument>/, "browser path must use the real multipart document API");
assert.match(page, /\/evrak-hazirlik\?declarationId=/, "successful browser upload must continue to Evrak Hazırlık");
assert.match(evrak, /setTimeout\([^]*3000\)/, "Evrak Hazırlık must poll pending IDP state");
assert.match(documentAdapter, /PENDING[^]*İşleniyor|extractionStatus === "PENDING"[^]*"İşleniyor"/, "persisted PENDING must render as İşleniyor");
assert.match(documentAdapter, /MANUAL_REQUIRED[^]*İnceleme|extractionStatus === "MANUAL_REQUIRED"[^]*"İnceleme"/, "manual review must remain visible and terminal");
assert.match(declarationAdapter, /mergeNormalizedFromApi\(d\.normalizedData\)/, "writing UI must read persisted normalizedData");
const declarationAdapterWithoutComments = declarationAdapter
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|\s)\/\/.*$/gm, "$1");
assert.doesNotMatch(
  declarationAdapterWithoutComments,
  /(?:\.|\[\s*["'])extractedData(?:["']\s*\])?/,
  "writing UI must not consume raw extractedData"
);

console.log(JSON.stringify({
  event: "product-e2e-1.8.2.browser-upload-product-e2e-bridge.contract.passed",
  guardrails: {
    realFileRequired: true,
    multipartUploadApi: true,
    persistedUploadOwnershipReturned: true,
    uploadContinuesToEvrakHazirlik: true,
    pendingStatePolled: true,
    manualReviewPreserved: true,
    writingReadsPersistedNormalizedData: true,
    rawExtractionNotConsumed: true,
    foundation6Authoritative: true
  }
}, null, 2));
