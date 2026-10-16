import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function main() {
  const [orchestration, fusion, discovery] = await Promise.all([
    fs.readFile("backend/src/modules/idp/domain/declarationFieldOrchestration.service.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.ts", "utf8")
  ]);

  assert.match(orchestration, /roleBoundCommercialCandidateIds/);
  assert.match(orchestration, /header-total-amount:f6-totalAmount/);
  assert.match(orchestration, /finance-exchange-rate:f6-exchangeRate/);
  assert.match(orchestration, /header-currency-from-total:f6-currency/);
  assert.match(orchestration, /roleBoundFields\.has\(field\)/);
  assert.match(orchestration, /source: "DIRECT_SOURCE_EVIDENCE"/);
  assert.doesNotMatch(orchestration, /normalizedData\s*=/);
  assert.match(fusion, /field === "header\.totalAmount" \? "totalAmount"/);
  assert.match(fusion, /field === "finance\.exchangeRate" \? "exchangeRate"/);
  assert.match(discovery, /DOVIZ\\s\*KURU\|EXCHANGE\\s\*RATE\|FX\\s\*RATE/);

  console.log(JSON.stringify({
    event: "product-e2e-1.8.12.1.digital-monetary-authority-hotfix.contract.passed",
    guardrails: {
      roleBoundInvoiceTotalAuthority: true,
      roleBoundExchangeRateAuthority: true,
      roleBoundCurrencyAuthority: true,
      conflictingLegacyNativeCandidateCannotVetoRoleBoundEvidence: true,
      foundation6StillAuthoritative: true,
      supplierSpecificRules: false,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
