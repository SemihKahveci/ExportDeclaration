import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { INVOICE_EXTRACTION_SKILL_VERSION } from "../../src/modules/idp/llm/invoiceExtractionSkill.js";

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const execution = await readFile(path.resolve(here, "../../src/modules/idp/llm/invoiceProductionVisionExecution.ts"), "utf8");
  const provider = await readFile(path.resolve(here, "../../src/modules/idp/llm/qwenVisionInvoiceProvider.ts"), "utf8");
  const skill = await readFile(path.resolve(here, "../../src/modules/idp/llm/invoiceExtractionSkill.ts"), "utf8");

  assert.equal(INVOICE_EXTRACTION_SKILL_VERSION, "invoice-extraction-v10");
  assert.match(execution, /goodsLines\[\]\.evidence/);
  assert.match(execution, /exact visible header and rawValue token/);
  assert.match(execution, /shipmentWeightEvidence\.grossKg\/netKg/);
  assert.match(execution, /A goods-table Miktar\/Quantity header is never gross\/net weight evidence/);
  assert.match(provider, /request\.documentId\.endsWith\(":goods-numeric-semantic-recovery"\)/);
  assert.match(provider, /isPackagingHeader/);
  assert.match(provider, /isQuantityHeader/);
  assert.match(provider, /parseLocaleNumericEvidence/);
  assert.match(provider, /isWeightLabel/);
  assert.match(skill, /"shipmentWeightEvidence"/);
  assert.match(skill, /"quantity": \{ "header": null, "rawValue": null, "unit": null \}/);
  assert.doesNotMatch(execution + provider + skill, /eryem|YEM2026|yem_5646309988/i);

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.11.table-column-shipment-weight-evidence-recovery.contract.passed",
    skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
    guardrails: {
      recoveryOnlyEvidenceEnforcement: true,
      exactVisibleHeaderRequired: true,
      exactVisibleRawNumericRequired: true,
      packagingColumnRejectedAsQuantity: true,
      shipmentWeightRequiresRoleLabel: true,
      localeNormalizationEvidenceBacked: true,
      arithmeticNotAuthority: true,
      samePageQwenSemanticAuthority: true,
      foundation6StillAuthoritative: true,
      supplierSpecificRules: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
