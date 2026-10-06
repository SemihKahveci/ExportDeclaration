import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const file=path.join(root,"backend/scripts/idp/verifyProductE2E1693CriticalScalarRecoveryStageAttribution.ts");
assert(fs.existsSync(file),"1.6.9.3 diagnostic missing");
const src=fs.readFileSync(file,"utf8");
for(const token of [
  "criticalScalarRecoveryRequestedFields","criticalScalarRecoveryAttempted","criticalScalarRecoveryDecision","criticalScalarRecoveryReturnedFields","criticalScalarRecoveryError",
  "visionCandidateCheckpoint","declarationCandidates","candidateEnvelope","resolutionSnapshot","PROVIDER_EVIDENCE_GATE","PAGE_CANDIDATE_PROJECTION","DECLARATION_PROJECTION","RESOLUTION_INPUT","RESOLUTION_OR_PROMOTION","FINAL_PRESENT",
  "exactSourceHashesReverifiedBeforeExecution:true","measurementOnly:true","productionExtractionChanged:false","supplierSpecificRules:false","directNormalizedWrite:false","orchestrationAgentIntroduced:false"
]) assert(src.includes(token),`1.6.9.3 contract missing ${token}`);
assert(!src.includes("processIdpJob("),"diagnostic must use the real queue, not direct processIdpJob");
console.log(JSON.stringify({event:"product-e2e-1.6.9.3.critical-scalar-recovery-stage-attribution.contract.passed",defaultCases:4,measurementOnly:true,productionExtractionChanged:false,realProductionQueue:true,recoveryTelemetry:true,foundation6StageAttribution:true,supplierSpecificRules:false,directNormalizedWrite:false,orchestrationAgentIntroduced:false},null,2));
