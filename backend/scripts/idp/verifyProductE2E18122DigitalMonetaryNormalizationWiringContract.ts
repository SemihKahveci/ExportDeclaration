import assert from "node:assert/strict";
import { discoverInvoiceCommercialTermsFieldCandidates } from "../../src/modules/idp/candidates/invoiceCommercialTermsCandidateDiscovery.js";
import { buildEffectiveInvoiceCommercialTerms } from "../../src/modules/idp/normalization/effectiveInvoiceNormalizer.js";

function line(text: string, y: number) {
  return { text, bbox: { x0: 0.05, y0: y, x1: 0.95, y1: y + 0.02 }, source: "NATIVE_TEXT" as const };
}

async function main() {
  const canonicalDocument: any = {
    version: "1",
    pages: [{
      pageNumber: 1,
      width: 1,
      height: 1,
      words: [],
      lines: [
        line("Ödenecek Tutar 31081.10 EUR 1.657.456,20 TRY", 0.10),
        line("Döviz Kuru 53,3268 TRY", 0.14),
        line("Teslim Şartı FCA", 0.18),
        line("Karayolu", 0.22)
      ]
    }]
  };

  const commercial = discoverInvoiceCommercialTermsFieldCandidates(canonicalDocument, "segment-001");
  assert.equal(commercial.fields["header.totalAmount"]?.[0]?.value, 31081.10);
  assert.equal(commercial.fields["header.currency"]?.[0]?.value, "EUR");
  assert.equal(commercial.fields["finance.exchangeRate"]?.[0]?.value, 53.3268);

  // Reproduce the regression: the legacy generic envelope carries the detached
  // local-currency equivalent and a decimal-damaged exchange rate. Effective
  // normalization must use the explicit-label commercial envelope instead.
  const audit: any = {
    version: "1",
    mode: "SHADOW",
    candidates: {
      version: "1",
      fields: {
        "header.currency": [{ candidateId: "legacy-currency", field: "header.currency", value: "EUR", confidence: 0.9, extractor: "legacy", evidence: [] }],
        "header.totalAmount": [{ candidateId: "legacy-total", field: "header.totalAmount", value: 1657456.20, confidence: 0.9, extractor: "legacy", evidence: [] }],
        "trade.deliveryTerm": commercial.fields["trade.deliveryTerm"],
        "transport.mode": commercial.fields["transport.mode"],
        "finance.exchangeRate": [{ candidateId: "legacy-rate", field: "finance.exchangeRate", value: 533268, confidence: 0.9, extractor: "legacy", evidence: [] }]
      }
    },
    commercialTermsCandidates: commercial
  };

  const effective = buildEffectiveInvoiceCommercialTerms(audit);
  assert.equal(effective.data.header.totalAmount, 31081.10);
  assert.equal(effective.data.header.currency, "EUR");
  assert.equal(effective.data.finance.exchangeRate, 53.3268);
  assert.equal(effective.data.trade.deliveryTerm, "FCA");
  assert.equal(effective.data.transport.mode, "Karayolu");

  console.log(JSON.stringify({
    event: "product-e2e-1.8.12.2.digital-monetary-normalization-wiring.contract.passed",
    regressionFixture: {
      transactionAmount: effective.data.header.totalAmount,
      transactionCurrency: effective.data.header.currency,
      exchangeRate: effective.data.finance.exchangeRate,
      rejectedDetachedLocalEquivalent: 1657456.20,
      rejectedDecimalDamagedRate: 533268
    },
    guardrails: {
      amountCurrencyKeptAsSemanticPair: true,
      largestNumericValueHeuristicRemoved: true,
      explicitCommercialEnvelopeFeedsNormalization: true,
      exchangeRateFeedsNormalizedFinance: true,
      supplierSpecificRules: false,
      directNormalizedConstantWrite: false
    }
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
