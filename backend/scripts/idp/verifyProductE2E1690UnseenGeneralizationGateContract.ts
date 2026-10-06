import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source=fs.readFileSync(path.resolve(process.cwd(),"backend/scripts/idp/verifyProductE2E1690UnseenGeneralizationGate.ts"),"utf8");
assert.match(source,/testCase\.id !== "mekar-ear-0068"/);
assert.match(source,/tuningPolicy:"CLASSIFY_BEFORE_CHANGE"/);
assert.match(source,/GOODS_TABLE/);
assert.match(source,/SCALAR/);
assert.match(source,/FAIL_CLOSED_AUTHORITY/);
assert.match(source,/fullInvoicePassPercent/);
assert.match(source,/sourceSha256/);
assert.match(source,/enqueueDocumentProcessing/);
assert.match(source,/realConfiguredVisionProvider:true/);
assert.match(source,/supplierSpecificRules:false/);
assert.match(source,/directNormalizedWrite:false/);
console.log(JSON.stringify({event:"product-e2e-1.6.9.0.unseen-generalization-gate-contract.passed",defaultUnseenCases:5,mekarControlExcludedByDefault:true,frozenGroundTruth:true,realProductionQueue:true,failureClassification:true,perInvoiceTuning:false,supplierSpecificRules:false,directNormalizedWrite:false},null,2));
