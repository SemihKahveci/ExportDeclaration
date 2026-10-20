/**
 * Goods line-amount scale authority.
 * Arithmetic may repair only a clean scale blow of an already-present
 * commercial quantity and unit price. A modest difference, an explicit zero,
 * or a total that explains a different commercial quantity stays. Any other
 * severe contradiction is review, never an invented total.
 */

const SCALE_FACTORS = [100, 1000, 10000, 100000] as const;

export type GoodsLineTotalScaleDecision =
  | { action: "keep" }
  | { action: "repair"; value: number; rejected: number }
  | { action: "review"; rejected: number };

function centsDigits(value: number): string {
  return String(Math.abs(Math.round(value * 100)));
}

function isScaleFactor(ratio: number): boolean {
  return SCALE_FACTORS.some((factor) => Math.abs(ratio - factor) / factor <= 0.02);
}

function trailingZeroScale(lineTotal: number, reference: number): boolean {
  const totalDigits = centsDigits(lineTotal);
  const referenceDigits = centsDigits(reference);
  if (referenceDigits.length < 3 || totalDigits.length <= referenceDigits.length) return false;
  return totalDigits.startsWith(referenceDigits) && /^0+$/.test(totalDigits.slice(referenceDigits.length));
}

function corroborates(quantity: number, unitPrice: number, lineTotal: number): boolean {
  const expected = quantity * unitPrice;
  const scale = Math.max(1, Math.abs(lineTotal));
  return Math.abs(expected - lineTotal) <= Math.max(1e-6 * scale, 0.01);
}

function severeInflation(lineTotal: number, expected: number, unitPrice: number): boolean {
  if (lineTotal > expected * 5) return true;
  if (isScaleFactor(lineTotal / expected)) return true;
  return trailingZeroScale(lineTotal, unitPrice);
}

export function classifyGoodsLineTotalScale(
  quantity: number,
  unitPrice: number,
  lineTotal: number
): GoodsLineTotalScaleDecision {
  if (!(quantity > 0) || !(unitPrice > 0) || !(lineTotal > 0)) return { action: "keep" };
  const computed = quantity * unitPrice;
  const cents = Math.round(computed * 100) / 100;
  if (Math.abs(computed - cents) > 0.005) return { action: "keep" };
  if (corroborates(quantity, unitPrice, lineTotal)) return { action: "keep" };
  if (!severeInflation(lineTotal, cents, unitPrice)) return { action: "keep" };

  const ratio = lineTotal / cents;
  if (isScaleFactor(ratio) || trailingZeroScale(lineTotal, unitPrice) || trailingZeroScale(lineTotal, cents)) {
    return { action: "repair", value: cents, rejected: lineTotal };
  }

  // The published total divides cleanly into a different commercial quantity
  // (packaging count vs KG). That total is evidence for the quantity, not a
  // scale blow of the current quantity.
  const implied = lineTotal / unitPrice;
  const impliedQuantity = Math.round(implied);
  if (
    Math.abs(implied - impliedQuantity) <= 1e-4
    && impliedQuantity >= 1
    && Math.abs(impliedQuantity - quantity) > 1e-6
    && !isScaleFactor(impliedQuantity / quantity)
  ) {
    return { action: "keep" };
  }

  return { action: "review", rejected: lineTotal };
}
