import { env } from "../../../config/env.js";
import { FieldLlmResolveDecision, type FieldLlmProvider } from "../domain/fieldLlmResolve.types.js";
import { FieldResolutionMethod, FieldResolutionStatus, type FieldCandidate, type FieldCandidateEnvelope, type FieldResolutionEnvelope } from "../domain/fieldCandidate.types.js";
import { resolveFieldCandidates } from "../resolver/fieldCandidateResolver.js";
import { QwenOpenAiProvider } from "./qwenOpenAiProvider.js";

export interface ResolveFieldCandidatesWithLlmOptions { llmEnabled?: boolean; provider?: FieldLlmProvider; }
export interface FieldLlmResolutionOutcome { resolution: FieldResolutionEnvelope; provider?: string; model?: string; issue?: { code: "FIELD_LLM_REVIEW_REQUIRED" | "FIELD_LLM_INVALID_SELECTION" | "FIELD_LLM_RESOLUTION_FAILED"; message: string }; }

function ambiguousEntries(envelope: FieldCandidateEnvelope, resolution: FieldResolutionEnvelope) {
  return Object.values(resolution.fields).filter((f) => f.status === FieldResolutionStatus.AMBIGUOUS).map((f) => ({ field: f.field, candidates: envelope.fields[f.field] ?? [] }));
}

export async function resolveFieldCandidatesWithLlm(envelope: FieldCandidateEnvelope, options: ResolveFieldCandidatesWithLlmOptions = {}): Promise<FieldLlmResolutionOutcome> {
  const deterministic = resolveFieldCandidates(envelope);
  if (deterministic.status === FieldResolutionStatus.RESOLVED) return { resolution: deterministic };
  if (!(options.llmEnabled ?? env.llmEnabled)) return { resolution: deterministic };

  const ambiguous = ambiguousEntries(envelope, deterministic);
  const provider = options.provider ?? new QwenOpenAiProvider();
  try {
    const response = await provider.resolveFieldCandidates({ version: "1", task: "RESOLVE_FIELD_CANDIDATES", fields: ambiguous });
    if (response.decision === FieldLlmResolveDecision.REVIEW_REQUIRED) return { resolution: deterministic, provider: response.provider, model: response.model, issue: { code: "FIELD_LLM_REVIEW_REQUIRED", message: response.issues.map((i) => i.message).join(" | ") || "LLM field belirsizliğini çözemedi." } };

    const expectedFields = new Set(ambiguous.map((entry) => entry.field));
    const selections = new Map<string, string>();
    for (const selection of response.selections) {
      if (!expectedFields.has(selection.field) || selections.has(selection.field)) return { resolution: deterministic, provider: response.provider, model: response.model, issue: { code: "FIELD_LLM_INVALID_SELECTION", message: `LLM geçersiz veya yinelenen field seçimi döndürdü: ${selection.field}` } };
      selections.set(selection.field, selection.candidateId);
    }
    if (selections.size !== expectedFields.size) return { resolution: deterministic, provider: response.provider, model: response.model, issue: { code: "FIELD_LLM_INVALID_SELECTION", message: "LLM tüm ambiguous field'lar için seçim döndürmedi." } };

    const fields = { ...deterministic.fields };
    for (const entry of ambiguous) {
      const candidateId = selections.get(entry.field)!;
      const candidate = entry.candidates.find((c: FieldCandidate) => c.candidateId === candidateId);
      if (!candidate) return { resolution: deterministic, provider: response.provider, model: response.model, issue: { code: "FIELD_LLM_INVALID_SELECTION", message: `LLM candidate kümesinde olmayan candidateId seçti: ${candidateId}` } };
      fields[entry.field] = { field: entry.field, status: FieldResolutionStatus.RESOLVED, method: FieldResolutionMethod.LLM, candidateIds: entry.candidates.map((c) => c.candidateId), selectedCandidateId: candidate.candidateId, value: candidate.value };
    }
    return { resolution: { version: "1", status: FieldResolutionStatus.RESOLVED, fields, summary: { fieldCount: Object.keys(fields).length, resolvedCount: Object.keys(fields).length, ambiguousCount: 0 } }, provider: response.provider, model: response.model };
  } catch (error) {
    return { resolution: deterministic, issue: { code: "FIELD_LLM_RESOLUTION_FAILED", message: `LLM field resolution başarısız: ${error instanceof Error ? error.message : String(error)}` } };
  }
}
