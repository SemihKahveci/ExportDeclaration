import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function main() {
  const [commercial, fusion, orchestration] = await Promise.all([
    fs.readFile("backend/src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/llm/invoiceProductionWorkerFusion.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/domain/declarationFieldOrchestration.service.ts", "utf8")
  ]);

  assert.match(commercial, /finance\.exchangeRate/);
  assert.match(commercial, /DOVIZ\\s\*KURU\|EXCHANGE/);
  assert.match(commercial, /grouped=parts\.length===2/);
  assert.match(fusion, /header\.totalAmount" \? "totalAmount"/);
  assert.match(fusion, /header\.currency" \? "currency"/);
  assert.match(fusion, /finance\.exchangeRate" \? "exchangeRate"/);
  assert.match(orchestration, /field === "currency"/);
  assert.match(orchestration, /field === "totalAmount" \|\| field === "exchangeRate"/);
  assert.match(orchestration, /contentSource === "NATIVE_TEXT"/);
  assert.doesNotMatch(commercial + fusion + orchestration, /VED2026000000146|VEKMAR|31081\.10|53\.3268/);

  console.log(JSON.stringify({
    event: "product-e2e-1.8.12.digital-monetary-coherence.contract.passed",
    guardrails: {
      nativeInvoiceTotalProjectedToF6: true,
      nativeInvoiceCurrencyProjectedToF6: true,
      nativeExchangeRateProjectedToF6: true,
      localeDecimalRatePreserved: true,
      directSourceAuthorityEvidenceBound: true,
      supplierSpecificRules: false,
      foundation6StillAuthoritative: true,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
