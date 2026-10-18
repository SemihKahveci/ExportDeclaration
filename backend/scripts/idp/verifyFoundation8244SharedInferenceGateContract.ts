import assert from "node:assert/strict";
import fs from "node:fs";

const vision = fs.readFileSync("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts", "utf8");
const text = fs.readFileSync("backend/src/modules/idp/llm/qwenTextInvoiceProvider.ts", "utf8");

assert.match(vision, /export async function acquireVisionSlot/);
assert.match(text, /import \{ acquireVisionSlot \} from "\.\/qwenVisionInvoiceProvider\.js"/);
assert.match(text, /const slot = await acquireVisionSlot\(\)/);
assert.match(text, /sharedInferenceGate: true/);
assert.match(text, /finally \{\s*slot\.release\(\);\s*\}/s);

console.log({ event: "foundation-8.24.4.shared-inference-gate.contract.passed" });
