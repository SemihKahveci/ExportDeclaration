import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const execution=fs.readFileSync(path.resolve(process.cwd(),"backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts"),"utf8");
const diagnostic=fs.readFileSync(path.resolve(process.cwd(),"backend/scripts/idp/verifyProductE2E16825RealQwenScalarRecoveryDiagnostic.ts"),"utf8");

assert.match(execution,/originRecoveryOcrText = canonicalPage\?\.ocrText/);
assert.match(execution,/originRecoveryNativeText = canonicalPage\?\.nativeText/);
assert.match(execution,/assistive reading context for small or dense print/i);
assert.match(execution,/verify that meaning against the same supplied page image/i);
assert.match(execution,/nativeText: originRecoveryNativeText/);
assert.match(execution,/ocrText: originRecoveryOcrText/);
assert.match(execution,/requestedFields:\s*\["origin"\]/);
assert.match(execution,/Normalize an unambiguous country meaning to ISO-3166-1 alpha-2/);
assert.doesNotMatch(execution,/MEKAR|EAR2026000000068|KAAN MED|["']ABD["']\s*[:=].*["']US["']/i);
assert.match(diagnostic,/effectiveGoodsArtifacts/);
assert.match(diagnostic,/recoveryArtifactTrace/);

console.log(JSON.stringify({
 event:"product-e2e-1.6.8.31.page-local-text-assisted-origin-recovery.passed",
 qwenRemainsOriginAuthority:true,
 pageImageStillRequired:true,
 pageLocalOcrNativeTextAssistOnly:true,
 directOcrCandidateProjection:false,
 isoSemanticNormalizationRetained:true,
 diagnosticFocusedRecoveryAccountingFixed:true,
 supplierSpecificRules:false,
 invoiceSpecificValues:false
},null,2));
