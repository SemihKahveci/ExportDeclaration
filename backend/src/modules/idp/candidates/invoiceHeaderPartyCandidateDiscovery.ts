import type {
  CanonicalBBox,
  CanonicalDocument,
  CanonicalLine,
  CanonicalPage,
  CanonicalWord,
} from "../domain/canonicalDocument.types.js";
import type {
  FieldCandidate,
  FieldCandidateEnvelope,
} from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-header-party-generic-v4";

type EvidenceLine = {
  text: string;
  bbox: CanonicalBBox;
  source: "NATIVE_TEXT" | "OCR";
  pageNumber: number;
};

function norm(text: string): string {
  return text
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ç/g, "C")
    .replace(/Ğ/g, "G")
    .replace(/Ö/g, "O")
    .replace(/Ş/g, "S")
    .replace(/Ü/g, "U")
    .replace(/\s+/g, " ")
    .trim();
}

function unionBox(words: CanonicalWord[]): CanonicalBBox {
  return {
    x0: Math.min(...words.map((w) => w.bbox.x0)),
    y0: Math.min(...words.map((w) => w.bbox.y0)),
    x1: Math.max(...words.map((w) => w.bbox.x1)),
    y1: Math.max(...words.map((w) => w.bbox.y1)),
  };
}

function visualLines(page: CanonicalPage): EvidenceLine[] {
  if (page.lines?.length) {
    return page.lines
      .filter((line) => line.text.trim())
      .map((line: CanonicalLine) => ({
        text: line.text.trim(),
        bbox: line.bbox,
        source: line.source,
        pageNumber: page.pageNumber,
      }));
  }

  const words = page.words
    .slice()
    .sort(
      (a, b) =>
        (a.bbox.y0 + a.bbox.y1) / 2 -
          (b.bbox.y0 + b.bbox.y1) / 2 ||
        a.bbox.x0 - b.bbox.x0,
    );

  const groups: CanonicalWord[][] = [];

  for (const word of words) {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const group = groups.find((candidate) => {
      const first = candidate[0]!;
      const groupCy = (first.bbox.y0 + first.bbox.y1) / 2;
      return Math.abs(groupCy - cy) <= 0.012;
    });

    if (group) group.push(word);
    else groups.push([word]);
  }

  return groups
    .map((group) => group.sort((a, b) => a.bbox.x0 - b.bbox.x0))
    .map((group) => ({
      text: group.map((word) => word.text).join(" ").trim(),
      bbox: unionBox(group),
      source: group.some((word) => word.source === "OCR")
        ? "OCR"
        : "NATIVE_TEXT",
      pageNumber: page.pageNumber,
    }));
}

function candidate(
  field: string,
  value: unknown,
  id: string,
  segmentId: string,
  line: EvidenceLine,
  confidence: number,
): FieldCandidate {
  return {
    candidateId: id,
    field,
    value,
    confidence,
    extractor: EXTRACTOR,
    evidence: [
      {
        segmentId,
        pageNumber: line.pageNumber,
        bbox: line.bbox,
        text: line.text,
        contentSource: line.source,
      },
    ],
  };
}

function add(
  fields: Record<string, FieldCandidate[]>,
  value: FieldCandidate | undefined,
): void {
  if (value) (fields[value.field] ??= []).push(value);
}

function centerY(bbox: CanonicalBBox): number {
  return (bbox.y0 + bbox.y1) / 2;
}

function centerX(bbox: CanonicalBBox): number {
  return (bbox.x0 + bbox.x1) / 2;
}

function sameVisualRow(a: EvidenceLine, b: EvidenceLine): boolean {
  const ah = Math.max(0.006, a.bbox.y1 - a.bbox.y0);
  const bh = Math.max(0.006, b.bbox.y1 - b.bbox.y0);
  return Math.abs(centerY(a.bbox) - centerY(b.bbox)) <= Math.max(ah, bh) * 0.8;
}

function findLabel(
  lines: EvidenceLine[],
  pattern: RegExp,
): EvidenceLine | undefined {
  return lines.find((line) => pattern.test(norm(line.text)));
}

function cleanDate(raw: string): string | undefined {
  const match = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (!match) return undefined;

  return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
}

function invoiceNumber(
  lines: EvidenceLine[],
): { value: string; line: EvidenceLine } | undefined {
  const label = findLabel(lines, /\bFATURA\s*NO\b/);
  const values: Array<{ value: string; line: EvidenceLine }> = [];

  for (const line of lines) {
    if (/(IRSALIYE|ETTN)/.test(norm(line.text))) continue;

    for (const token of line.text.split(/\s+/)) {
      const value = token.replace(/[^A-Za-z0-9]/g, "");
      if (/^[A-Za-z]{3}[0-9]{13}$/.test(value)) {
        values.push({ value: value.toUpperCase(), line });
      }
    }
  }

  if (!values.length) return undefined;
  if (!label) return values.length === 1 ? values[0] : undefined;

  const sameRow = values
    .filter((entry) => sameVisualRow(entry.line, label))
    .filter((entry) => centerX(entry.line.bbox) >= centerX(label.bbox) - 0.02)
    .sort((a, b) => a.line.bbox.x0 - b.line.bbox.x0);

  if (sameRow.length) return sameRow[0];

  return values
    .slice()
    .sort(
      (a, b) =>
        Math.abs(centerY(a.line.bbox) - centerY(label.bbox)) -
        Math.abs(centerY(b.line.bbox) - centerY(label.bbox)),
    )[0];
}

function invoiceDate(
  lines: EvidenceLine[],
): { value: string; line: EvidenceLine } | undefined {
  const label = findLabel(lines, /\bFATURA\s*TARIHI\b/);
  const values: Array<{ value: string; line: EvidenceLine }> = [];

  for (const line of lines) {
    if (/(IRSALIYE|ETTN)/.test(norm(line.text))) continue;

    const match = line.text.match(/\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/);
    const value = match?.[0] ? cleanDate(match[0]) : undefined;
    if (value) values.push({ value, line });
  }

  if (!values.length) return undefined;
  if (!label) return values.length === 1 ? values[0] : undefined;

  const sameRow = values
    .filter((entry) => sameVisualRow(entry.line, label))
    .filter((entry) => centerX(entry.line.bbox) >= centerX(label.bbox) - 0.02)
    .sort((a, b) => a.line.bbox.x0 - b.line.bbox.x0);

  if (sameRow.length) return sameRow[0];

  // Fail closed instead of borrowing a different date such as dispatch date.
  return undefined;
}

function isNoise(text: string): boolean {
  const value = norm(text);

  return (
    !value ||
    /^(E-?FATURA|FATURA|SAYIN|WEB SITESI|E-POSTA|TEL|FAX|VKN|VERGI|TICARET|OZELLESTIRME|SENARYO|FATURA TIPI|FATURA NO|FATURA TARIHI|IRSALIYE|ETTN)\b/.test(
      value,
    )
  );
}

function looksLikePartyName(text: string): boolean {
  const value = norm(text);

  return (
    !isNoise(text) &&
    /[A-Z]/.test(value) &&
    !/^\d/.test(value) &&
    !/(CADDE|SOKAK|MAHALLE|MAH\b|NO[: ]|TEL|FAX|WWW\.|@|VERGI|VKN|TICARET SICIL|TICARETSICIL)/.test(
      value,
    )
  );
}

function companySignal(text: string): number {
  const value = norm(text);
  let score = 0;

  if (/\b(A\.?S\.?|LTD|LIMITED|LLC|INC|CORP|CORPORATION|GMBH|OU|OÜ|S\.?A\.?|S\.?R\.?L\.?)\b/.test(value)) {
    score += 4;
  }

  if (/\b(SANAYI|TICARET|ELEKTRIK|TEKNOLOJI|TECHNOLOGY|SYSTEM|SISTEM|INDUSTRY|INDUSTRIES|COMPANY)\b/.test(value)) {
    score += 2;
  }

  if (value.length >= 8 && value.length <= 100) score += 1;

  return score;
}

function findSayin(lines: EvidenceLine[]): EvidenceLine | undefined {
  return lines.find((line) => /^SAYIN\b/.test(norm(line.text)));
}

function sellerParty(
  lines: EvidenceLine[],
): EvidenceLine | undefined {
  const sayin = findSayin(lines);
  if (!sayin) return undefined;

  const sayinY = centerY(sayin.bbox);

  const candidates = lines
    .filter((line) => line.pageNumber === sayin.pageNumber)
    .filter((line) => centerY(line.bbox) < sayinY - 0.01)
    .filter((line) => line.bbox.x0 < 0.55)
    .filter((line) => looksLikePartyName(line.text))
    .map((line) => ({
      line,
      score:
        companySignal(line.text) * 10 +
        Math.max(0, 3 - Math.abs(sayinY - centerY(line.bbox)) * 10),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.line.bbox.y0 - b.line.bbox.y0);

  return candidates[0]?.line;
}

function buyerParty(
  lines: EvidenceLine[],
): EvidenceLine | undefined {
  const sayin = findSayin(lines);
  if (!sayin) return undefined;

  const sayinY = centerY(sayin.bbox);

  const candidates = lines
    .filter((line) => line.pageNumber === sayin.pageNumber)
    .filter((line) => centerY(line.bbox) > sayinY)
    .filter((line) => centerY(line.bbox) < sayinY + 0.12)
    .filter((line) => Math.abs(line.bbox.x0 - sayin.bbox.x0) < 0.12)
    .filter((line) => looksLikePartyName(line.text))
    .map((line) => ({
      line,
      score:
        companySignal(line.text) * 10 -
        Math.abs(centerY(line.bbox) - sayinY) * 10,
    }))
    .sort((a, b) => b.score - a.score || a.line.bbox.y0 - b.line.bbox.y0);

  return candidates[0]?.line;
}

export function discoverInvoiceHeaderPartyFieldCandidates(
  canonical: CanonicalDocument,
  segmentId: string,
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const lines = canonical.pages.slice(0, 2).flatMap(visualLines);

  const number = invoiceNumber(lines);
  if (number) {
    add(
      fields,
      candidate(
        "header.invoiceNo",
        number.value,
        "header-invoice-no",
        segmentId,
        number.line,
        0.99,
      ),
    );
  }

  const date = invoiceDate(lines);
  if (date) {
    add(
      fields,
      candidate(
        "header.invoiceDate",
        date.value,
        "header-invoice-date",
        segmentId,
        date.line,
        0.99,
      ),
    );
  }

  const seller = sellerParty(lines);
  if (seller) {
    add(
      fields,
      candidate(
        "parties.seller.name",
        seller.text.trim(),
        "party-seller-name",
        segmentId,
        seller,
        0.96,
      ),
    );
  }

  const buyer = buyerParty(lines);
  if (buyer) {
    add(
      fields,
      candidate(
        "parties.buyer.name",
        buyer.text.trim(),
        "party-buyer-name",
        segmentId,
        buyer,
        0.96,
      ),
    );
  }

  return {
    version: "1",
    fields,
  };
}
