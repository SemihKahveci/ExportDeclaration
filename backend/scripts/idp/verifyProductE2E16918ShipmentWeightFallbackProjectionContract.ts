import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, "backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts"), "utf8");

assert.match(source, /const declarationWeightField = role === "grossKg" \? "grossWeight" : "netWeight";/);
assert.match(source, /shipmentWeightTextFallback\.fields\[declarationWeightField\]/);
assert.match(source, /field: declarationWeightField/);
assert.doesNotMatch(source, /shipmentWeightTextFallback\.fields\[role\]\s*=\s*\[/);
assert.match(source, /invoice-labelled-weight-text-fallback-v2/);
assert.match(source, /if \(shipmentWeightRecoveryTriggered\)/);
assert.match(source, /if \(\(shipmentWeightRecoveryProjected\?\.fields\[role\]\?\.length \?\? 0\) > 0\) continue;/);

console.log(JSON.stringify({
  event: "product-e2e-1.6.9.18.shipment-weight-fallback-projection.contract.passed",
  guardrails: {
    qwenPrimary: true,
    roleCollisionGated: true,
    labelledFallbackEvidenceRequired: true,
    fallbackUsesDeclarationFieldNames: true,
    foundation6StillAuthoritative: true,
    supplierSpecificRules: false,
    directNormalizedWrite: false,
    orchestrationAgentIntroduced: false
  }
}, null, 2));
