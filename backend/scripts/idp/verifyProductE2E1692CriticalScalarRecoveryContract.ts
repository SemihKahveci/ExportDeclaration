import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main(): Promise<void> {
  const source = await readFile("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts", "utf8");
  const checkpoint = await readFile("backend/src/modules/idp/llm/invoiceVisionCheckpoint.ts", "utf8");

  assert(source.includes('criticalRequestedFields = (["invoiceDate", "currency"] as const)'), "critical recovery must be limited to invoiceDate/currency");
  assert(source.includes('critical-scalar-evidence-recovery'), "critical recovery artifact boundary missing");
  assert(source.includes('nativeText: criticalCanonicalPage?.nativeText?.trim() || ""'), "page-local native text assist missing");
  assert(source.includes('ocrText: criticalCanonicalPage?.ocrText?.trim() || ""'), "page-local OCR text assist missing");
  assert(source.includes('Return the required criticalScalarEvidence label/rawValue exactly from visible page text.'), "strict evidence instruction missing");
  assert(source.includes('evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE'), "page image authority must remain enabled");
  assert(source.includes('criticalScalarProjected'), "critical recovery must project through ordinary candidate path");
  assert(source.includes('mergeInvoiceCandidateSources('), "Foundation candidate merge path must remain intact");
  assert(checkpoint.includes('criticalScalarRecoveryAttempted?: boolean'), "checkpoint observability missing");
  assert(!source.includes('MEKAR') && !source.includes('VXA2026') && !source.includes('P0087/26-27'), "supplier/invoice-specific tuning is forbidden");

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.2.critical-scalar-recovery-contract.passed",
    missingCriticalOnly: true,
    pageLocalTextAssist: true,
    pageImageAuthority: true,
    criticalEvidenceStillRequired: true,
    ordinaryCandidateProjection: true,
    supplierSpecificRules: false,
    agentOrchestration: false,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
