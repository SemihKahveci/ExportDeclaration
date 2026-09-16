import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { DocumentSegment } from "../domain/documentSegment.types.js";
import type { SegmentClassification } from "../domain/segmentClassification.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";

export function projectCanonicalDocumentToSegments(
  document: CanonicalDocument,
  segments: DocumentSegment[],
  classifications: SegmentClassification[],
  documentType: string
): CanonicalDocument | undefined {
  const selectedIds = new Set(
    classifications
      .filter((classification) => classification.documentType === documentType)
      .map((classification) => classification.segmentId)
  );
  if (!selectedIds.size) return undefined;

  const pageNumbers = new Set(
    segments
      .filter((segment) => selectedIds.has(segment.segmentId))
      .flatMap((segment) => segment.pageNumbers)
  );
  const pages = document.pages.filter((page) => pageNumbers.has(page.pageNumber));
  if (!pages.length) return undefined;

  return {
    ...document,
    analysis: {
      ...document.analysis,
      pageCount: pages.length,
      digitalPageCount: pages.filter((page) => page.contentKind === "DIGITAL").length,
      scannedPageCount: pages.filter((page) => page.contentKind === "SCANNED").length,
      mixedPageCount: pages.filter((page) => page.contentKind === "MIXED").length,
      nativeTextPageCount: pages.filter((page) => page.hasNativeText).length,
      ocrPageCount: pages.filter((page) => page.ocrApplied).length,
      ocrWordCount: pages.reduce((sum, page) => sum + (page.ocrWordCount ?? 0), 0)
    },
    pages
  };
}

export function projectInvoiceCanonicalDocument(
  document: CanonicalDocument,
  segments: DocumentSegment[],
  classifications: SegmentClassification[]
): CanonicalDocument | undefined {
  return projectCanonicalDocumentToSegments(
    document,
    segments,
    classifications,
    ClassifiedDocumentType.INVOICE
  );
}
