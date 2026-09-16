export type PdfContentKind = "DIGITAL" | "SCANNED" | "MIXED";

export interface CanonicalBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CanonicalWord {
  text: string;
  bbox: CanonicalBBox;
  confidence: number;
  source: "NATIVE_TEXT" | "OCR";
}

export interface CanonicalLine {
  text: string;
  bbox: CanonicalBBox;
  source: "NATIVE_TEXT" | "OCR";
}

export interface CanonicalPage {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  nativeText: string;
  nativeCharCount: number;
  nativeWordCount: number;
  hasNativeText: boolean;
  imageCount: number;
  imageCoverage: number;
  contentKind: PdfContentKind;
  ocrApplied?: boolean;
  ocrText?: string;
  ocrWordCount?: number;
  words: CanonicalWord[];
  lines: CanonicalLine[];
}

export interface CanonicalDocument {
  schemaVersion: "1.0";
  source: {
    fileName?: string;
    mimeType?: string;
    sha256?: string;
  };
  analysis: {
    contentKind: PdfContentKind;
    pageCount: number;
    digitalPageCount: number;
    scannedPageCount: number;
    mixedPageCount: number;
    nativeTextPageCount: number;
    ocrPageCount?: number;
    ocrWordCount?: number;
  };
  pages: CanonicalPage[];
}
