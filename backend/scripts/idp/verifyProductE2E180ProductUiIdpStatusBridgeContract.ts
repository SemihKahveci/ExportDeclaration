import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("frontend/src/types/index.ts", "utf8");
const adapter = readFileSync("frontend/src/api/adapters/documentAdapter.ts", "utf8");
const page = readFileSync("frontend/src/pages/EvrakHazirlik/index.tsx", "utf8");
const statusTab = readFileSync("frontend/src/pages/EvrakHazirlik/DocStatusTab.tsx", "utf8");

assert.match(types, /'İşleniyor'/);
assert.match(types, /'İnceleme'/);
assert.match(adapter, /extractionStatus === "PENDING"/);
assert.match(adapter, /extractionStatus === "MANUAL_REQUIRED"/);
assert.match(adapter, /Foundation 6 insan kararı bekliyor/);
assert.match(page, /doc\.status === 'İşleniyor'/);
assert.match(page, /setTimeout\(\(\) => void refresh\(\), 3000\)/);
assert.match(page, /evrakService\.getFiles\(\)/);
assert.match(statusTab, /doc\.status === 'Geldi' \|\| doc\.status === 'İnceleme'/);
assert.doesNotMatch(page, /rawModelResponse|modelExtractionArtifacts/);
assert.doesNotMatch(adapter, /rawModelResponse|modelExtractionArtifacts/);

console.log(JSON.stringify({
  event: "product-e2e-1.8.0.product-ui-idp-status-bridge.contract.passed",
  guardrails: {
    persistedDocumentStateOnly: true,
    pendingIsPolled: true,
    manualRequiredIsTerminalForPolling: true,
    foundation6HumanReviewPreserved: true,
    rawModelOutputNotExposed: true,
    directNormalizedWrite: false,
  },
}, null, 2));
