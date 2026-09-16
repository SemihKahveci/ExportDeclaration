export type SegmentBoundaryReason =
  | "DOCUMENT_START"
  | "DOCUMENT_TYPE_CHANGE"
  | "DOCUMENT_ID_CHANGE"
  | "PAGE_NUMBER_RESET"
  | "PAGE_SEQUENCE_COMPLETED"
  | "HEADER_DISCONTINUITY";

export interface SegmentBoundarySignals {
  anchor?: string;
  previousAnchor?: string;
  documentId?: string;
  previousDocumentId?: string;
  pageNumberHint?: number;
  previousPageNumberHint?: number;
  pageTotalHint?: number;
  previousPageTotalHint?: number;
  headerSimilarity?: number;
  boundaryScore?: number;
  evidence?: string[];
}

export interface DocumentSegment {
  segmentId: string;
  startPage: number;
  endPage: number;
  pageNumbers: number[];
  boundaryReason: SegmentBoundaryReason;
  boundarySignals: SegmentBoundarySignals;
}
