import type { CanonicalDocument, CanonicalPage } from "../domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../domain/documentSegment.types.js";
import {
  ClassifiedDocumentType,
  type ClassifiedDocumentTypeValue,
  type SegmentClassification
} from "../domain/segmentClassification.types.js";

type Rule = {
  type: ClassifiedDocumentTypeValue;
  weight: number;
  evidence: string;
  pattern: RegExp;
};

const RULES: Rule[] = [
  { type: ClassifiedDocumentType.CERTIFICATE_OF_ORIGIN, weight: 10, evidence: "title:certificate-of-origin", pattern: /\bcertificate\s+of\s+origin\b/i },
  { type: ClassifiedDocumentType.CERTIFICATE_OF_ORIGIN, weight: 8, evidence: "title:certificat-d-origine", pattern: /\bcertificat\s+d['’]?origine\b/i },
  { type: ClassifiedDocumentType.ATR, weight: 10, evidence: "title:atr-number", pattern: /\ba\.?\s*t\.?\s*r\.?\s*(?:nr|no|number)\b/i },
  { type: ClassifiedDocumentType.ATR, weight: 9, evidence: "title:atr-movement-certificate", pattern: /\ba\.?\s*t\.?\s*r\.?\s+(?:movement\s+)?certificate\b/i },
  { type: ClassifiedDocumentType.EUR1, weight: 10, evidence: "title:eur1-certificate", pattern: /\beur[.\s-]*1\s+(?:movement\s+)?certificate\b/i },
  { type: ClassifiedDocumentType.EUR1, weight: 9, evidence: "title:movement-certificate-eur1", pattern: /\bmovement\s+certificate\s+eur[.\s-]*1\b/i },
  { type: ClassifiedDocumentType.PACKING_LIST, weight: 10, evidence: "title:packing-list", pattern: /\bpacking\s+list\b/i },
  { type: ClassifiedDocumentType.BILL_OF_LADING, weight: 10, evidence: "title:bill-of-lading", pattern: /\bbill\s+of\s+lading\b/i },
  { type: ClassifiedDocumentType.CMR, weight: 10, evidence: "title:cmr-consignment-note", pattern: /\bcmr\s+(?:international\s+)?consignment\s+note\b/i },
  { type: ClassifiedDocumentType.INVOICE, weight: 10, evidence: "title:commercial-invoice", pattern: /\bcommercial\s+invoice\b/i },
  { type: ClassifiedDocumentType.INVOICE, weight: 9, evidence: "field:invoice-number", pattern: /\binvoice\s*(?:nr|no|number|#)\b/i },
  { type: ClassifiedDocumentType.INVOICE, weight: 9, evidence: "field:fatura-number", pattern: /\bfatura\s*(?:no|numarası|numarasi)\b/i },
  { type: ClassifiedDocumentType.INVOICE, weight: 7, evidence: "field:invoice-date", pattern: /\binvoice\s+date\b/i }
];

const ANCHOR_TYPE: Record<string, ClassifiedDocumentTypeValue> = {
  INVOICE: ClassifiedDocumentType.INVOICE,
  PACKING_LIST: ClassifiedDocumentType.PACKING_LIST,
  ATR: ClassifiedDocumentType.ATR,
  EUR1: ClassifiedDocumentType.EUR1,
  CERTIFICATE_OF_ORIGIN: ClassifiedDocumentType.CERTIFICATE_OF_ORIGIN,
  BILL_OF_LADING: ClassifiedDocumentType.BILL_OF_LADING,
  CMR: ClassifiedDocumentType.CMR
};

function pageText(page: CanonicalPage): string {
  return (page.ocrApplied ? page.ocrText : page.nativeText) || page.nativeText || page.ocrText || "";
}

function segmentText(document: CanonicalDocument, segment: DocumentSegment): string {
  const wanted = new Set(segment.pageNumbers);
  return document.pages
    .filter((page) => wanted.has(page.pageNumber))
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(pageText)
    .join("\n")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyDocumentSegment(
  document: CanonicalDocument,
  segment: DocumentSegment
): SegmentClassification {
  const text = segmentText(document, segment);
  const scores = new Map<ClassifiedDocumentTypeValue, number>();
  const evidence = new Map<ClassifiedDocumentTypeValue, string[]>();

  const add = (type: ClassifiedDocumentTypeValue, weight: number, item: string) => {
    scores.set(type, (scores.get(type) ?? 0) + weight);
    const items = evidence.get(type) ?? [];
    if (!items.includes(item)) items.push(item);
    evidence.set(type, items);
  };

  const anchor = segment.boundarySignals.anchor;
  if (anchor && ANCHOR_TYPE[anchor]) {
    add(ANCHOR_TYPE[anchor], 8, `segment-anchor:${anchor}`);
  }

  for (const rule of RULES) {
    if (rule.pattern.test(text)) add(rule.type, rule.weight, rule.evidence);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;

  // Classification is deliberately conservative. Weak/ambiguous evidence stays UNKNOWN;
  // later resolver stages may use an LLM without contaminating deterministic classification.
  if (!best || best[1] < 8 || (second && best[1] - second[1] < 3)) {
    return {
      segmentId: segment.segmentId,
      documentType: ClassifiedDocumentType.UNKNOWN,
      confidence: 0,
      method: "DETERMINISTIC",
      evidence: ranked.length
        ? [`ambiguous:${ranked.slice(0, 3).map(([type, score]) => `${type}=${score}`).join(",")}`]
        : ["no-strong-document-type-evidence"]
    };
  }

  const confidence = Math.min(0.99, 0.55 + best[1] * 0.035 + Math.min(0.12, ((best[1] - (second?.[1] ?? 0)) * 0.015)));
  return {
    segmentId: segment.segmentId,
    documentType: best[0],
    confidence: Number(confidence.toFixed(3)),
    method: "DETERMINISTIC",
    evidence: evidence.get(best[0]) ?? []
  };
}

export function classifyDocumentSegments(
  document: CanonicalDocument,
  segments: DocumentSegment[]
): SegmentClassification[] {
  return segments.map((segment) => classifyDocumentSegment(document, segment));
}
