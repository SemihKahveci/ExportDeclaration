import type { CanonicalDocument, CanonicalPage, CanonicalWord } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-goods-token-fill-v1";
const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;

function rowIndexes(fields: FieldCandidateEnvelope["fields"]): number[] {
  return [...new Set(
    Object.keys(fields)
      .map((field) => ROW_FIELD_RE.exec(field)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
  )].sort((left, right) => left - right);
}

function firstCandidate(fields: FieldCandidateEnvelope["fields"], field: string): FieldCandidate | undefined {
  const values = fields[field] ?? [];
  return values.slice().sort((left, right) => right.confidence - left.confidence || left.candidateId.localeCompare(right.candidateId))[0];
}

function numericValue(candidate: FieldCandidate | undefined): number | undefined {
  const value = candidate?.value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function compact(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function needles(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const out: string[] = [];
  const whole = compact(value);
  if (whole.length >= 4) out.push(whole);
  for (const part of value.trim().split(/[.\s/_-]+/)) {
    const token = compact(part);
    if (token.length >= 4) out.push(token);
  }
  return [...new Set(out)];
}

function locateRowAnchor(
  canonical: CanonicalDocument,
  productValue: unknown,
  hsValue: unknown
): { page: CanonicalPage; word: CanonicalWord } | undefined {
  const wanted = [...needles(productValue), ...needles(hsValue)];
  if (!wanted.length) return undefined;
  let best: { page: CanonicalPage; word: CanonicalWord; score: number } | undefined;
  for (const page of canonical.pages) {
    for (const word of page.words) {
      const token = compact(word.text);
      if (token.length < 4) continue;
      for (const needle of wanted) {
        const exact = token === needle;
        const nested = (needle.includes(token) && token.length >= 5) || (token.includes(needle) && needle.length >= 5);
        if (!exact && !nested) continue;
        const score = (exact ? 300 : 200) + Math.min(token.length, needle.length);
        if (!best || score > best.score) best = { page, word, score };
      }
    }
  }
  return best ? { page: best.page, word: best.word } : undefined;
}

function numericReadings(raw: string): number[] {
  const text = raw.trim().replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return [];
  const readings: number[] = [];
  const push = (value: number) => {
    if (Number.isFinite(value) && value > 0 && !readings.some((existing) => Math.abs(existing - value) <= 1e-9)) {
      readings.push(value);
    }
  };
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep < 0) {
    push(Number(text));
    return readings;
  }
  const trailing = text.length - lastSep - 1;
  const separatorCount = (text.match(/[.,]/g) ?? []).length;
  if (separatorCount === 1 && trailing === 3) {
    push(Number(text.replace(/[.,]/g, "")));
    push(Number(text.replace(/[.,]/g, ".")));
    return readings;
  }
  const decimal = lastComma > lastDot ? "," : ".";
  const thousands = decimal === "," ? "." : ",";
  push(Number(text.split(thousands).join("").replace(decimal, ".")));
  return readings;
}

function closeEnough(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.002);
}

function rowBand(page: CanonicalPage, anchor: CanonicalWord): CanonicalWord[] {
  const anchorY = (anchor.bbox.y0 + anchor.bbox.y1) / 2;
  return page.words.filter((word) => {
    const y = (word.bbox.y0 + word.bbox.y1) / 2;
    return y >= anchorY - 0.012 && y <= anchorY + 0.05;
  });
}

/**
 * Fills one missing commercial number from a visible token on the same row.
 * The other two numbers must already be present and the token must equal their
 * product or quotient. An existing Vision value is never replaced.
 */
export function discoverCorroboratedGoodsNumericFill(
  canonical: CanonicalDocument,
  segmentId: string,
  goodsCandidates: FieldCandidateEnvelope
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  for (const rowIndex of rowIndexes(goodsCandidates.fields)) {
    const quantity = numericValue(firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.quantity`));
    const unitPrice = numericValue(firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.unitPrice`));
    const lineTotal = numericValue(firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.lineTotal`));
    const present = [quantity, unitPrice, lineTotal].filter((value): value is number => value != null && value > 0);
    if (present.length !== 2) continue;

    let missing: "quantity" | "unitPrice" | "lineTotal";
    let expected: number;
    if (quantity == null && unitPrice != null && lineTotal != null) {
      missing = "quantity";
      expected = lineTotal / unitPrice;
    } else if (unitPrice == null && quantity != null && lineTotal != null) {
      missing = "unitPrice";
      expected = lineTotal / quantity;
    } else if (lineTotal == null && quantity != null && unitPrice != null) {
      missing = "lineTotal";
      expected = quantity * unitPrice;
    } else {
      continue;
    }
    if (!Number.isFinite(expected) || expected <= 0) continue;
    if (missing === "quantity" && Math.abs(expected - Math.round(expected)) > 1e-4) continue;

    const anchor = locateRowAnchor(
      canonical,
      firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.productCode`)?.value,
      firstCandidate(goodsCandidates.fields, `goodsLines.${rowIndex}.hsCode`)?.value
    );
    if (!anchor) continue;

    const matches = rowBand(anchor.page, anchor.word).flatMap((word) =>
      numericReadings(word.text)
        .filter((reading) => closeEnough(reading, expected))
        .map((reading) => ({ word, reading }))
    );
    const selected = matches.sort((left, right) => {
      const leftY = Math.abs((left.word.bbox.y0 + left.word.bbox.y1) / 2 - (anchor.word.bbox.y0 + anchor.word.bbox.y1) / 2);
      const rightY = Math.abs((right.word.bbox.y0 + right.word.bbox.y1) / 2 - (anchor.word.bbox.y0 + anchor.word.bbox.y1) / 2);
      return leftY - rightY;
    })[0];
    if (!selected) continue;

    const field = `goodsLines.${rowIndex}.${missing}`;
    const value = missing === "quantity" ? Math.round(selected.reading) : Math.round(selected.reading * 10000) / 10000;
    fields[field] = [{
      candidateId: `${segmentId}:token-fill:line-${rowIndex + 1}:${missing}`,
      field,
      value,
      confidence: 0.97,
      extractor: EXTRACTOR,
      evidence: [{
        segmentId,
        pageNumber: anchor.page.pageNumber,
        bbox: selected.word.bbox,
        text: selected.word.text,
        contentSource: selected.word.source
      }]
    }];
  }
  return { version: "1", fields };
}
