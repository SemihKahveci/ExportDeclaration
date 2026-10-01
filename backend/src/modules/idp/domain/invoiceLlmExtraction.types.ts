export const InvoiceLlmEvidenceMode = {
  TEXT: "TEXT",
  PAGE_IMAGE: "PAGE_IMAGE",
  HYBRID: "HYBRID"
} as const;
export type InvoiceLlmEvidenceModeValue = (typeof InvoiceLlmEvidenceMode)[keyof typeof InvoiceLlmEvidenceMode];

export const InvoiceLlmExtractionDecision = {
  EXTRACTED: "EXTRACTED",
  PARTIAL: "PARTIAL",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;
export type InvoiceLlmExtractionDecisionValue = (typeof InvoiceLlmExtractionDecision)[keyof typeof InvoiceLlmExtractionDecision];

export interface InvoiceLlmEvidenceRef {
  pageNumber: number;
  source: "NATIVE_TEXT" | "OCR" | "PAGE_IMAGE" | "VERIFIED_KNOWLEDGE";
  quote?: string;
  region?: { x: number; y: number; width: number; height: number };
}

export interface InvoiceLlmExtractedField {
  field: string;
  value: unknown;
  confidence: number;
  evidence: InvoiceLlmEvidenceRef[];
}

export interface InvoiceLlmExtractionRequest {
  version: "1";
  documentId: string;
  evidenceMode: InvoiceLlmEvidenceModeValue;
  requestedFields: string[];
  nativeText?: string;
  ocrText?: string;
  pageImageIds?: string[];
  verifiedKnowledge?: Array<{ label: string; content: string }>;
}

export interface InvoiceLlmExtractionArtifact {
  version: "1";
  provider: string;
  model: string;
  skillVersion: string;
  documentId: string;
  evidenceMode: InvoiceLlmEvidenceModeValue;
  requestedFields: string[];
  pageNumbers: number[];
  /** Exact model message content before provider adaptation. Image bytes are intentionally excluded. */
  rawModelResponse: string;
  /** Provider-validated semantic response before candidate projection/resolution. */
  parsedSemanticResponse: {
    version: "1";
    decision: InvoiceLlmExtractionDecisionValue;
    fields: InvoiceLlmExtractedField[];
    issues: Array<{ code: string; message: string }>;
  };
}

export interface InvoiceLlmExtractionResponse {
  version: "1";
  decision: InvoiceLlmExtractionDecisionValue;
  fields: InvoiceLlmExtractedField[];
  issues: Array<{ code: string; message: string }>;
  model: string;
  provider: string;
  extractionArtifact?: InvoiceLlmExtractionArtifact;
}


export interface InvoiceLlmPageImage {
  pageNumber: number;
  mimeType: "image/png" | "image/jpeg";
  bytes: Buffer;
}

export interface InvoiceLlmExtractionProvider {
  readonly name: string;
  extractInvoice(
    request: InvoiceLlmExtractionRequest,
    pageImages?: InvoiceLlmPageImage[]
  ): Promise<InvoiceLlmExtractionResponse>;
}
