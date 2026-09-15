export const ProcessingStatus = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  CANCELLED: "CANCELLED"
} as const;
export type ProcessingStatusValue = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

export const ProcessingStage = {
  INGEST: "INGEST",
  ANALYZE: "ANALYZE",
  EXTRACT_CONTENT: "EXTRACT_CONTENT",
  SEGMENT: "SEGMENT",
  CLASSIFY: "CLASSIFY",
  EXTRACT_CANDIDATES: "EXTRACT_CANDIDATES",
  RESOLVE: "RESOLVE",
  VALIDATE: "VALIDATE",
  FINALIZE: "FINALIZE"
} as const;
export type ProcessingStageValue = (typeof ProcessingStage)[keyof typeof ProcessingStage];
