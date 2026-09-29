import assert from "node:assert/strict";
import { canonicalPromotionValue } from "../../src/modules/idp/domain/declarationFieldPromotion.service.js";

function iso(value: unknown): string | undefined {
  return value instanceof Date ? value.toISOString() : undefined;
}

async function main() {
  const turkishWithTime = canonicalPromotionValue("header.invoiceDate", "24-04-2026 16:41");
  const slashWithSeconds = canonicalPromotionValue("header.invoiceDate", "24/04/2026 16:41:22");
  const yearFirst = canonicalPromotionValue("header.invoiceDate", "2026-04-24 16:41");
  const dateOnly = canonicalPromotionValue("header.invoiceDate", "24.04.2026");
  const invalidClock = canonicalPromotionValue("header.invoiceDate", "24-04-2026 29:99");
  const invalidDate = canonicalPromotionValue("header.invoiceDate", "31-02-2026 16:41");
  const unrelated = canonicalPromotionValue("invoiceNo", "24-04-2026 16:41");

  assert.equal(iso(turkishWithTime), "2026-04-24T00:00:00.000Z");
  assert.equal(iso(slashWithSeconds), "2026-04-24T00:00:00.000Z");
  assert.equal(iso(yearFirst), "2026-04-24T00:00:00.000Z");
  assert.equal(iso(dateOnly), "2026-04-24T00:00:00.000Z");
  assert.equal(invalidClock, "24-04-2026 29:99");
  assert.equal(invalidDate, "31-02-2026 16:41");
  assert.equal(unrelated, "24-04-2026 16:41");

  console.log(JSON.stringify({
    event: "product-e2e-1.5.21.invoice-date-time-promotion-canonicalization.passed",
    dateTimeSuffixCanonicalized: true,
    calendarDatePreservedAtUtcMidnight: true,
    dateOnlyBehaviorPreserved: true,
    invalidClockFailsClosed: true,
    invalidCalendarDateFailsClosed: true,
    unrelatedFieldsUnchanged: true,
    guardrails: {
      supplierSpecificRuleAdded: false,
      noModelInferenceRequired: true,
      noDatabaseMutation: true,
      directNormalizedWrite: false
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
