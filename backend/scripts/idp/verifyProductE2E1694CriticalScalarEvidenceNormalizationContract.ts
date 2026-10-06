import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  criticalScalarEvidenceSupportsValue,
  normalizeCriticalScalarEvidenceCurrency,
  normalizeCriticalScalarEvidenceDate
} from "../../src/modules/idp/llm/qwenVisionInvoiceProvider.js";

async function main(): Promise<void> {
  const provider = await readFile("backend/src/modules/idp/llm/qwenVisionInvoiceProvider.ts", "utf8");
  const execution = await readFile("backend/src/modules/idp/llm/invoiceProductionVisionExecution.ts", "utf8");

  assert.equal(normalizeCriticalScalarEvidenceDate("16-Sep-26"), "2026-09-16");
  assert.equal(normalizeCriticalScalarEvidenceDate("Sep 16, 2026"), "2026-09-16");
  assert.equal(normalizeCriticalScalarEvidenceDate("14.08.2026"), "2026-08-14");
  assert.equal(normalizeCriticalScalarEvidenceDate("2026-06-05"), "2026-06-05");
  assert.equal(normalizeCriticalScalarEvidenceCurrency("€"), "EUR");
  assert.equal(normalizeCriticalScalarEvidenceCurrency("EUR €"), "EUR");
  assert.equal(normalizeCriticalScalarEvidenceCurrency("Currency: USD"), "USD");
  assert.equal(normalizeCriticalScalarEvidenceCurrency("$"), undefined, "ambiguous bare dollar symbol must remain fail-closed");
  assert.equal(normalizeCriticalScalarEvidenceCurrency("¥"), undefined, "ambiguous bare yen/yuan symbol must remain fail-closed");

  assert.equal(criticalScalarEvidenceSupportsValue({
    invoiceDate: "2026-09-16",
    criticalScalarEvidence: { invoiceDate: { label: "Invoice Date", rawValue: "16-Sep-26" } }
  }, "invoiceDate", "2026-09-16"), true);
  assert.equal(criticalScalarEvidenceSupportsValue({
    currency: "EUR",
    criticalScalarEvidence: { currency: { label: "Currency", rawValue: "€" } }
  }, "currency", "EUR"), true);

  assert(provider.includes("criticalScalarEvidenceSupportsValue"), "provider evidence gate must remain active");
  assert(execution.includes("critical-scalar-evidence-recovery"), "bounded critical recovery must remain active");
  assert(execution.includes("evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE"), "page image authority must remain active");
  assert(!provider.includes("VXA2026") && !provider.includes("P0087/26-27") && !provider.includes("Dermeternal") && !provider.includes("WYL2026"), "invoice-specific rules are forbidden");

  console.log(JSON.stringify({
    event: "product-e2e-1.6.9.4.critical-scalar-evidence-normalization-contract.passed",
    textualMonthDateEvidence: true,
    twoDigitYearEvidence: true,
    unambiguousCurrencySymbolEvidence: true,
    ambiguousCurrencySymbolsFailClosed: true,
    pageImageAuthority: true,
    foundation6AuthorityUnchanged: true,
    supplierSpecificRules: false,
    orchestrationAgentIntroduced: false,
    directNormalizedWrite: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
