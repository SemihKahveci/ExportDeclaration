import { env } from "../../../config/env.js";
import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope
} from "../domain/candidateExtraction.types.js";
import {
  CandidateResolutionStatus,
  type CandidateResolutionEnvelope
} from "../domain/candidateResolution.types.js";
import {
  LlmResolveDecision,
  type LlmProvider
} from "../domain/llmResolve.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";
import { resolveCandidates } from "../resolver/candidateResolver.js";
import { createLlmProvider } from "./llmProviderFactory.js";
import {
  decideLlmResolvePolicy,
  LlmResolvePolicyDecision
} from "./llmResolvePolicy.js";

export interface ResolveCandidatesWithLlmOptions {
  llmEnabled?: boolean;
  provider?: LlmProvider;
}

function extractedInvoiceSegmentIds(envelope: CandidateExtractionEnvelope): Set<string> {
  return new Set(
    envelope.segments
      .filter(
        (candidate) =>
          candidate.documentType === ClassifiedDocumentType.INVOICE &&
          candidate.status === CandidateExtractionStatus.EXTRACTED &&
          candidate.data
      )
      .map((candidate) => candidate.segmentId)
  );
}

/**
 * Resolution orchestration boundary.
 *
 * Deterministic resolution always runs first. LLM is only eligible for the
 * explicitly allowed ambiguous-candidate case. Provider failures never crash
 * the worker: ambiguity remains REVIEW_REQUIRED and is audited.
 */
export async function resolveCandidatesWithLlm(
  envelope: CandidateExtractionEnvelope,
  options: ResolveCandidatesWithLlmOptions = {}
): Promise<CandidateResolutionEnvelope> {
  const deterministic = resolveCandidates(envelope);
  const policy = decideLlmResolvePolicy(envelope);

  if (policy !== LlmResolvePolicyDecision.ALLOW_AMBIGUOUS_CANDIDATES) {
    return deterministic;
  }

  const llmEnabled = options.llmEnabled ?? env.llmEnabled;
  if (!llmEnabled) return deterministic;

  const provider = options.provider ?? createLlmProvider();

  try {
    const response = await provider.resolveCandidates({
      version: "1",
      task: "RESOLVE_INVOICE_CANDIDATES",
      candidates: envelope
    });

    const allowedSegmentIds = extractedInvoiceSegmentIds(envelope);
    const invalidSourceIds = response.sourceSegmentIds.filter(
      (segmentId) => !allowedSegmentIds.has(segmentId)
    );

    if (invalidSourceIds.length > 0) {
      return {
        version: "1",
        status: CandidateResolutionStatus.REVIEW_REQUIRED,
        documentType: ClassifiedDocumentType.INVOICE,
        strategy: "MANUAL_REVIEW",
        sourceSegmentIds: [...allowedSegmentIds],
        issues: [{
          code: "LLM_INVALID_SOURCE_SEGMENT",
          message: `LLM candidate kümesinde olmayan segment referansladı: ${invalidSourceIds.join(", ")}`,
          segmentIds: invalidSourceIds
        }],
        llmAudit: { provider: response.provider, model: response.model }
      };
    }

    if (response.decision === LlmResolveDecision.REVIEW_REQUIRED) {
      return {
        version: "1",
        status: CandidateResolutionStatus.REVIEW_REQUIRED,
        documentType: ClassifiedDocumentType.INVOICE,
        strategy: "MANUAL_REVIEW",
        sourceSegmentIds: response.sourceSegmentIds,
        issues: [{
          code: "LLM_REVIEW_REQUIRED",
          message: response.issues.map((issue) => issue.message).join(" | ") || "LLM belirsizliği çözemedi.",
          segmentIds: response.sourceSegmentIds
        }],
        llmAudit: { provider: response.provider, model: response.model }
      };
    }

    if (!response.data || response.sourceSegmentIds.length === 0) {
      throw new Error("LLM RESOLVED sonucu data ve sourceSegmentIds içermeli.");
    }

    return {
      version: "1",
      status: CandidateResolutionStatus.RESOLVED,
      documentType: ClassifiedDocumentType.INVOICE,
      strategy: "LLM",
      sourceSegmentIds: response.sourceSegmentIds,
      data: response.data,
      issues: [],
      llmAudit: { provider: response.provider, model: response.model }
    };
  } catch (error) {
    return {
      version: "1",
      status: CandidateResolutionStatus.REVIEW_REQUIRED,
      documentType: ClassifiedDocumentType.INVOICE,
      strategy: "MANUAL_REVIEW",
      sourceSegmentIds: [...extractedInvoiceSegmentIds(envelope)],
      issues: [{
        code: "LLM_RESOLUTION_FAILED",
        message: `LLM resolution başarısız: ${error instanceof Error ? error.message : String(error)}`,
        segmentIds: [...extractedInvoiceSegmentIds(envelope)]
      }]
    };
  }
}
