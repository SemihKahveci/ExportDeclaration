export const InvoiceEvidenceQuality = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNAVAILABLE: "UNAVAILABLE"
} as const;
export type InvoiceEvidenceQualityValue = (typeof InvoiceEvidenceQuality)[keyof typeof InvoiceEvidenceQuality];

export const InvoiceExtractionRoute = {
  HYBRID_TEXT: "HYBRID_TEXT",
  HYBRID_PARALLEL: "HYBRID_PARALLEL",
  LLM_VISION_PRIMARY: "LLM_VISION_PRIMARY",
  DETERMINISTIC_ONLY: "DETERMINISTIC_ONLY",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
} as const;
export type InvoiceExtractionRouteValue = (typeof InvoiceExtractionRoute)[keyof typeof InvoiceExtractionRoute];

export interface InvoiceExtractionRouteInput {
  llmEnabled: boolean;
  visionLlmAvailable: boolean;
  pageImagesAvailable: boolean;
  nativeTextQuality: InvoiceEvidenceQualityValue;
  ocrQuality: InvoiceEvidenceQualityValue;
}

/**
 * 1.6.5 architecture lock: when a local vision-capable LLM and page images are
 * available, semantic invoice understanding is LLM/VLM-primary regardless of
 * whether native/OCR text quality is high. Native text and OCR remain evidence
 * and corroboration channels; they do not become the semantic authority merely
 * because text extraction succeeded. Deterministic-only remains an explicit
 * degraded/fallback route when the configured LLM path is unavailable.
 */
export function chooseInvoiceExtractionRoute(input: InvoiceExtractionRouteInput): InvoiceExtractionRouteValue {
  const { llmEnabled, visionLlmAvailable, pageImagesAvailable, nativeTextQuality, ocrQuality } = input;
  if (!llmEnabled) {
    return nativeTextQuality !== InvoiceEvidenceQuality.UNAVAILABLE || ocrQuality !== InvoiceEvidenceQuality.UNAVAILABLE
      ? InvoiceExtractionRoute.DETERMINISTIC_ONLY
      : InvoiceExtractionRoute.REVIEW_REQUIRED;
  }

  if (visionLlmAvailable && pageImagesAvailable) return InvoiceExtractionRoute.LLM_VISION_PRIMARY;

  if (nativeTextQuality === InvoiceEvidenceQuality.HIGH) return InvoiceExtractionRoute.HYBRID_TEXT;

  if (nativeTextQuality !== InvoiceEvidenceQuality.UNAVAILABLE || ocrQuality !== InvoiceEvidenceQuality.UNAVAILABLE) {
    return InvoiceExtractionRoute.HYBRID_PARALLEL;
  }
  return InvoiceExtractionRoute.REVIEW_REQUIRED;
}
