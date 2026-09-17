import type { CanonicalBBox, CanonicalDocument, CanonicalPage } from "../domain/canonicalDocument.types.js";
import type {
  FieldCandidate,
  FieldCandidateEnvelope,
  FieldCandidateEvidence
} from "../domain/fieldCandidate.types.js";

const EXTRACTOR = "invoice-canonical-v1";

type NormalizedGoodsLine = {
  hsCode?: unknown;
  productCode?: unknown;
  description?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
};

type RawInvoiceItem = {
  lineNo?: number;
  productCode?: string | null;
  description?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  unitPrice?: string | number | null;
  amount?: string | number | null;
  gtip?: string | null;
  boxes?: Record<string, unknown>;
  source?: Record<string, unknown>;
};

function asFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function legacyDimensions(page: CanonicalPage): { width: number; height: number } {
  if (page.contentKind === "DIGITAL") return { width: 1700, height: 2500 };
  return { width: page.width * 3, height: page.height * 3 };
}

function normalizeBox(raw: unknown, page: CanonicalPage): CanonicalBBox | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const values = raw.map(asFiniteNumber);
  if (values.some((value) => value === undefined)) return undefined;

  const [x0, y0, x1, y1] = values as number[];
  const legacy = legacyDimensions(page);
  if (legacy.width <= 0 || legacy.height <= 0) return undefined;

  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x0: clamp(x0 / legacy.width),
    y0: clamp(y0 / legacy.height),
    x1: clamp(x1 / legacy.width),
    y1: clamp(y1 / legacy.height)
  };
}

function intersects(a: CanonicalBBox, b: CanonicalBBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

function evidenceText(page: CanonicalPage, bbox?: CanonicalBBox): string | undefined {
  if (!bbox) return undefined;
  const words = page.words
    .filter((word) => intersects(word.bbox, bbox))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
    .map((word) => word.text.trim())
    .filter(Boolean);
  return words.length ? words.join(" ") : undefined;
}

function sourceForPage(page: CanonicalPage, bbox?: CanonicalBBox): "NATIVE_TEXT" | "OCR" {
  if (bbox) {
    const matching = page.words.filter((word) => intersects(word.bbox, bbox));
    if (matching.some((word) => word.source === "OCR")) return "OCR";
  }
  return page.contentKind === "DIGITAL" ? "NATIVE_TEXT" : "OCR";
}

function add<T>(
  fields: Record<string, FieldCandidate[]>,
  field: string,
  value: T | null | undefined,
  evidence: FieldCandidateEvidence,
  candidateId: string,
  confidence: number,
  derived = false
) {
  if (value === null || value === undefined || value === "") return;
  const candidate: FieldCandidate<T> = {
    candidateId,
    field,
    value,
    confidence,
    extractor: EXTRACTOR,
    evidence: [evidence],
    ...(derived ? { derived: true } : {})
  };
  (fields[field] ??= []).push(candidate as FieldCandidate);
}

function normalizedGoodsLinesFromData(data: Record<string, unknown>): NormalizedGoodsLine[] {
  return Array.isArray(data.goodsLines) ? data.goodsLines as NormalizedGoodsLine[] : [];
}

function rawItemsFromData(data: Record<string, unknown>): RawInvoiceItem[] {
  const meta = data.extractMeta;
  if (!meta || typeof meta !== "object") return [];
  const rawItems = (meta as Record<string, unknown>).rawItems;
  return Array.isArray(rawItems) ? rawItems as RawInvoiceItem[] : [];
}

export function buildInvoiceFieldCandidates(
  data: Record<string, unknown>,
  canonicalDocument: CanonicalDocument,
  segmentId: string
): FieldCandidateEnvelope {
  const fields: Record<string, FieldCandidate[]> = {};
  const pages = new Map(canonicalDocument.pages.map((page) => [page.pageNumber, page]));

  const normalizedLines = normalizedGoodsLinesFromData(data);

  rawItemsFromData(data).forEach((item, index) => {
    const normalized = normalizedLines[index] ?? {};
    const lineNo = item.lineNo ?? index + 1;
    const pageNumber =
      asFiniteNumber(item.source?.page) ??
      canonicalDocument.pages[0]?.pageNumber;
    if (!pageNumber) return;

    const page = pages.get(pageNumber);
    if (!page) return;

    const boxes = item.boxes ?? {};
    const fieldSpecs: Array<[string, unknown, unknown, number]> = [
      [`goodsLines.${index}.hsCode`, normalized.hsCode, boxes.gtip, 0.99],
      [`goodsLines.${index}.productCode`, normalized.productCode, boxes.productCode, 0.95],
      [`goodsLines.${index}.quantity`, normalized.quantity, boxes.quantity, 0.95],
      [`goodsLines.${index}.unitPrice`, normalized.unitPrice, boxes.unitPrice, 0.95],
      [`goodsLines.${index}.lineTotal`, normalized.lineTotal, boxes.amount, 0.95]
    ];

    for (const [field, value, rawBox, confidence] of fieldSpecs) {
      const bbox = normalizeBox(rawBox, page);
      add(
        fields,
        field,
        value,
        {
          segmentId,
          pageNumber,
          bbox,
          text: evidenceText(page, bbox),
          contentSource: sourceForPage(page, bbox)
        },
        `${segmentId}:line-${lineNo}:${field.split(".").at(-1)}`,
        confidence
      );
    }

    // Description currently comes from a row window rather than one exact box.
    // Keep its provenance page/segment based; do not invent a bbox.
    add(
      fields,
      `goodsLines.${index}.description`,
      normalized.description,
      {
        segmentId,
        pageNumber,
        text: typeof item.description === "string" ? item.description : undefined,
        contentSource: sourceForPage(page)
      },
      `${segmentId}:line-${lineNo}:description`,
      0.85
    );

    // Unit may be inferred together with quantity; mark it as derived until
    // the Python extractor exposes a dedicated unit bbox.
    add(
      fields,
      `goodsLines.${index}.unit`,
      normalized.unit,
      {
        segmentId,
        pageNumber,
        contentSource: "DERIVED"
      },
      `${segmentId}:line-${lineNo}:unit`,
      0.8,
      true
    );
  });

  return { version: "1", fields };
}
