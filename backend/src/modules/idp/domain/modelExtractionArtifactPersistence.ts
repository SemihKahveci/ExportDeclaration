import type { InvoiceLlmExtractionArtifact } from "./invoiceLlmExtraction.types.js";

export function normalizeModelExtractionArtifacts(value: unknown): InvoiceLlmExtractionArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is InvoiceLlmExtractionArtifact => Boolean(
    item && typeof item === "object" &&
    (item as InvoiceLlmExtractionArtifact).version === "1" &&
    typeof (item as InvoiceLlmExtractionArtifact).documentId === "string" &&
    typeof (item as InvoiceLlmExtractionArtifact).rawModelResponse === "string"
  ));
}

/**
 * Idempotently retain the latest artifact for one semantic extraction boundary.
 * documentId is page-scoped in production (`segment:page:N`), so retries replace
 * the same page artifact rather than accumulating duplicate model responses.
 */
export function upsertModelExtractionArtifact(
  current: unknown,
  artifact: InvoiceLlmExtractionArtifact
): InvoiceLlmExtractionArtifact[] {
  const artifacts = normalizeModelExtractionArtifacts(current);
  const next = artifacts.filter((item) => item.documentId !== artifact.documentId);
  next.push(artifact);
  return next.sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));
}
