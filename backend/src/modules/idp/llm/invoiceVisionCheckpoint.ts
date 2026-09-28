import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";

export interface PersistedInvoiceVisionPageCheckpoint {
  status: "COMPLETED" | "FAILED";
  pageNumber: number;
  decision?: string;
  candidateCount?: number;
  candidates?: FieldCandidateEnvelope;
  error?: string;
}

export interface PersistedInvoiceVisionSegmentCheckpoint {
  pages: Record<string, PersistedInvoiceVisionPageCheckpoint>;
}

export interface PersistedInvoiceVisionCheckpoint {
  version: "1";
  segments: Record<string, PersistedInvoiceVisionSegmentCheckpoint>;
}

export function emptyInvoiceVisionCheckpoint(): PersistedInvoiceVisionCheckpoint {
  return { version: "1", segments: {} };
}

export function normalizeInvoiceVisionCheckpoint(value: unknown): PersistedInvoiceVisionCheckpoint {
  if (!value || typeof value !== "object") return emptyInvoiceVisionCheckpoint();
  const checkpoint = value as Partial<PersistedInvoiceVisionCheckpoint>;
  if (checkpoint.version !== "1" || !checkpoint.segments || typeof checkpoint.segments !== "object") {
    return emptyInvoiceVisionCheckpoint();
  }
  return checkpoint as PersistedInvoiceVisionCheckpoint;
}
