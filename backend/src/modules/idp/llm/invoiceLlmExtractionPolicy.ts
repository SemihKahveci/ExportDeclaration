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
 * LLM is intentionally a peer extraction path, not a last-resort decorator.
 * The policy is categorical so upstream quality scoring can evolve without
 * silently changing this authority contract.
 */
export function chooseInvoiceExtractionRoute(input: InvoiceExtractionRouteInput): InvoiceExtractionRouteValue {
  const { llmEnabled, visionLlmAvailable, pageImagesAvailable, nativeTextQuality, ocrQuality } = input;
  if (!llmEnabled) {
    return nativeTextQuality !== InvoiceEvidenceQuality.UNAVAILABLE || ocrQuality !== InvoiceEvidenceQuality.UNAVAILABLE
      ? InvoiceExtractionRoute.DETERMINISTIC_ONLY
      : InvoiceExtractionRoute.REVIEW_REQUIRED;
  }

  if (nativeTextQuality === InvoiceEvidenceQuality.HIGH) return InvoiceExtractionRoute.HYBRID_TEXT;

  if (visionLlmAvailable && pageImagesAvailable &&
      (ocrQuality === InvoiceEvidenceQuality.LOW || ocrQuality === InvoiceEvidenceQuality.UNAVAILABLE)) {
    return InvoiceExtractionRoute.LLM_VISION_PRIMARY;
  }

  if (nativeTextQuality !== InvoiceEvidenceQuality.UNAVAILABLE || ocrQuality !== InvoiceEvidenceQuality.UNAVAILABLE) {
    return InvoiceExtractionRoute.HYBRID_PARALLEL;
  }

  if (visionLlmAvailable && pageImagesAvailable) return InvoiceExtractionRoute.LLM_VISION_PRIMARY;
  return InvoiceExtractionRoute.REVIEW_REQUIRED;
}
