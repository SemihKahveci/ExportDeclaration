import { env } from "../../../config/env.js";
import {
  CandidateExtractionStatus,
  type CandidateExtractionEnvelope
} from "../domain/candidateExtraction.types.js";
import {
  CandidateResolutionStatus,
  type CandidateResolutionEnvelope
} from "../domain/candidateResolution.types.js";
import { FieldResolutionStatus } from "../domain/fieldCandidate.types.js";
import type { FieldLlmProvider } from "../domain/fieldLlmResolve.types.js";
import {
  LlmResolveDecision,
  type LlmProvider
} from "../domain/llmResolve.types.js";
import { ClassifiedDocumentType } from "../domain/segmentClassification.types.js";
import { resolveCandidates } from "../resolver/candidateResolver.js";
import {
  getFieldCandidateEnvelope,
  resolveFieldCandidates
} from "../resolver/fieldCandidateResolver.js";
import { createLlmProvider } from "./llmProviderFactory.js";
import { resolveFieldCandidatesWithLlm } from "./resolveFieldCandidatesWithLlm.js";
import {
  decideLlmResolvePolicy,
  LlmResolvePolicyDecision
} from "./llmResolvePolicy.js";

export interface ResolveCandidatesWithLlmOptions {
  llmEnabled?: boolean;
  provider?: LlmProvider;
  fieldProvider?: FieldLlmProvider;
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

async function resolveFieldsOrRequireReview(
  resolution: CandidateResolutionEnvelope,
  options: ResolveCandidatesWithLlmOptions
): Promise<CandidateResolutionEnvelope> {
  if (resolution.status !== CandidateResolutionStatus.RESOLVED || !resolution.data) return resolution;

  const candidates = getFieldCandidateEnvelope(resolution.data);
  if (!candidates) return resolution;

  const outcome = await resolveFieldCandidatesWithLlm(candidates, {
    llmEnabled: options.llmEnabled,
    provider: options.fieldProvider
  });
  const fieldResolution = outcome.resolution;

  if (fieldResolution.status === FieldResolutionStatus.RESOLVED) {
    const data = structuredClone(resolution.data);
    for (const field of Object.values(fieldResolution.fields)) {
      if (field.status !== FieldResolutionStatus.RESOLVED || field.value === undefined) continue;
      setPathValue(data, field.field, field.value);
    }
    return {
      ...resolution,
      data,
      fieldResolution,
      ...(outcome.provider && outcome.model ? { llmAudit: { provider: outcome.provider, model: outcome.model } } : {})
    };
  }

  const ambiguousFields = Object.values(fieldResolution.fields)
    .filter((field) => field.status === FieldResolutionStatus.AMBIGUOUS)
    .map((field) => field.field);
  const issueCode = outcome.issue?.code ?? "FIELD_CANDIDATE_AMBIGUITY";

  return {
    version: "1",
    status: CandidateResolutionStatus.REVIEW_REQUIRED,
    documentType: resolution.documentType,
    strategy: "MANUAL_REVIEW",
    sourceSegmentIds: resolution.sourceSegmentIds,
    issues: [{
      code: issueCode,
      message: outcome.issue?.message ?? `Çelişen field candidate değerleri bulundu: ${ambiguousFields.join(", ")}`,
      segmentIds: resolution.sourceSegmentIds
    }],
    fieldResolution,
    ...(outcome.provider && outcome.model ? { llmAudit: { provider: outcome.provider, model: outcome.model } } : resolution.llmAudit ? { llmAudit: resolution.llmAudit } : {})
  };
}

function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor: any = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = parts[i + 1]!;
    if (cursor[part] == null) cursor[part] = /^\d+$/.test(next) ? [] : {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]!] = value;
}

/**
 * Segment-level resolution orchestration plus deterministic field-level guard.
 * Field ambiguity is fail-closed in Foundation 4.4. A later LLM field resolver
 * may select candidate IDs, but it must never invent a value outside this set.
 */
export async function resolveCandidatesWithLlm(
  envelope: CandidateExtractionEnvelope,
  options: ResolveCandidatesWithLlmOptions = {}
): Promise<CandidateResolutionEnvelope> {
  const deterministic = resolveCandidates(envelope);
  const policy = decideLlmResolvePolicy(envelope);

  if (policy !== LlmResolvePolicyDecision.ALLOW_AMBIGUOUS_CANDIDATES) {
    return resolveFieldsOrRequireReview(deterministic, options);
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

    return resolveFieldsOrRequireReview({
      version: "1",
      status: CandidateResolutionStatus.RESOLVED,
      documentType: ClassifiedDocumentType.INVOICE,
      strategy: "LLM",
      sourceSegmentIds: response.sourceSegmentIds,
      data: response.data,
      issues: [],
      llmAudit: { provider: response.provider, model: response.model }
    }, options);
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
