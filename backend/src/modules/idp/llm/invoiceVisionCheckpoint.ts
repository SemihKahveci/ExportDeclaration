import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import type { InvoiceLlmExtractionArtifact } from "../domain/invoiceLlmExtraction.types.js";

export interface PersistedInvoiceVisionPageCheckpoint {
  status: "COMPLETED" | "FAILED";
  pageNumber: number;
  decision?: string;
  candidateCount?: number;
  candidates?: FieldCandidateEnvelope;
  extractionArtifact?: InvoiceLlmExtractionArtifact;
  recoveryDiagnostic?: {
    focusedRecoveryAttempted: boolean;
    focusedRecoveryUsed: boolean;
    scalarRecoveryRequestedFields: string[];
    scalarRecoveryAttempted: boolean;
    scalarRecoveryDecision?: string;
    scalarRecoveryReturnedFields: string[];
    scalarRecoveryError?: string;
  };
  error?: string;
}

export interface PersistedInvoiceVisionSegmentCheckpoint {
  pages: Record<string, PersistedInvoiceVisionPageCheckpoint>;
}

export interface PersistedInvoiceVisionCheckpoint {
  version: "1";
  /** Compatibility key for model/request semantics. Old or changed keys must not reuse page candidates. */
  executionKey?: string;
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


export function prepareInvoiceVisionCheckpoint(
  value: unknown,
  executionKey: string
): { checkpoint: PersistedInvoiceVisionCheckpoint; reusedCompatibleCheckpoint: boolean } {
  const checkpoint = normalizeInvoiceVisionCheckpoint(value);
  if (checkpoint.executionKey !== executionKey) {
    return {
      checkpoint: { version: "1", executionKey, segments: {} },
      reusedCompatibleCheckpoint: false
    };
  }
  return { checkpoint, reusedCompatibleCheckpoint: true };
}
