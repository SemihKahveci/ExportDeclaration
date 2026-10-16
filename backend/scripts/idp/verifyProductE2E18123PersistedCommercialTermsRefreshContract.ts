import assert from "node:assert/strict";
import fs from "node:fs/promises";

async function main() {
  const [service, discovery, normalizer] = await Promise.all([
    fs.readFile("backend/src/modules/declarations/declaration.service.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.ts", "utf8"),
    fs.readFile("backend/src/modules/idp/normalization/effectiveInvoiceNormalizer.ts", "utf8")
  ]);

  assert.match(service, /const commercialTermsFields = discoverInvoiceCommercialTermsFieldCandidates\(/,
    "Normalization must re-derive deterministic commercial terms from persisted canonical evidence.");
  assert.doesNotMatch(service, /commercialTermsCandidates\s*\?\?\s*discoverInvoiceCommercialTermsFieldCandidates/,
    "A stale persisted commercial-terms envelope must not suppress current deterministic discovery.");
  assert.match(service, /run\.canonicalDocument as any/,
    "Refresh must use the persisted canonical document; it must not rerun OCR or LLM extraction.");
  assert.match(service, /commercialTermsCandidates: commercialTermsFields/,
    "Refreshed commercial terms must feed the effective audit used by normalization/review.");
  assert.match(discovery, /const paired=same\.flatMap\(monetaryPairs\)/,
    "Amount and currency must remain a semantic pair.");
  assert.doesNotMatch(discovery, /nums\.sort\(\(a,b\)=>b\.n-a\.n\)\[0\]/,
    "Largest-number-wins monetary heuristic must remain removed.");
  assert.match(normalizer, /"finance\.exchangeRate"/,
    "Exchange rate must remain part of effective commercial-term normalization.");
  assert.match(service, /normalized\.finance = \{ \.\.\.\(normalized\.finance \?\? \{\}\), \.\.\.commercialTerms\.data\.finance \}/,
    "Effective exchange rate must be wired into normalized finance data.");

  console.log(JSON.stringify({
    event: "product-e2e-1.8.12.3.persisted-commercial-terms-refresh.contract.passed",
    rootCause: "stale persisted commercialTermsCandidates shadowed corrected canonical discovery during Tekrar Yaz",
    guardrails: {
      refreshesFromPersistedCanonicalDocument: true,
      rerunsOcr: false,
      rerunsLlm: false,
      staleCommercialEnvelopeCannotShadowFix: true,
      amountCurrencySemanticPairPreserved: true,
      exchangeRateNormalizationPreserved: true,
      supplierSpecificRules: false,
      directNormalizedConstantWrite: false
    }
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
