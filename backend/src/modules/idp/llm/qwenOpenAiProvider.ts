import { env } from "../../../config/env.js";
import { FieldLlmResolveDecision, type FieldLlmProvider, type FieldLlmResolveRequest, type FieldLlmResolveResponse } from "../domain/fieldLlmResolve.types.js";
import { LlmResolveDecision, type LlmProvider, type LlmResolveRequest, type LlmResolveResponse } from "../domain/llmResolve.types.js";

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function parseSegmentResponse(content: string): Omit<LlmResolveResponse, "model" | "provider"> {
  const parsed = JSON.parse(stripFence(content)) as Partial<LlmResolveResponse>;
  if (parsed.version !== "1") throw new Error("LLM response version geçersiz.");
  if (parsed.decision !== LlmResolveDecision.RESOLVED && parsed.decision !== LlmResolveDecision.REVIEW_REQUIRED) throw new Error("LLM response decision geçersiz.");
  if (!Array.isArray(parsed.sourceSegmentIds) || !Array.isArray(parsed.issues)) throw new Error("LLM response contract eksik.");
  if (parsed.decision === LlmResolveDecision.RESOLVED && (!parsed.data || typeof parsed.data !== "object")) throw new Error("RESOLVED LLM response data içermeli.");
  return { version: "1", decision: parsed.decision, sourceSegmentIds: parsed.sourceSegmentIds, data: parsed.data, issues: parsed.issues as Array<{ code: string; message: string }> };
}

function parseFieldResponse(content: string): Omit<FieldLlmResolveResponse, "model" | "provider"> {
  const parsed = JSON.parse(stripFence(content)) as Partial<FieldLlmResolveResponse>;
  if (parsed.version !== "1") throw new Error("Field LLM response version geçersiz.");
  if (parsed.decision !== FieldLlmResolveDecision.RESOLVED && parsed.decision !== FieldLlmResolveDecision.REVIEW_REQUIRED) throw new Error("Field LLM response decision geçersiz.");
  if (!Array.isArray(parsed.selections) || !Array.isArray(parsed.issues)) throw new Error("Field LLM response contract eksik.");
  for (const selection of parsed.selections) {
    if (!selection || typeof selection.field !== "string" || typeof selection.candidateId !== "string") throw new Error("Field LLM selection contract geçersiz.");
  }
  return { version: "1", decision: parsed.decision, selections: parsed.selections, issues: parsed.issues as Array<{ code: string; message: string }> };
}

export class QwenOpenAiProvider implements LlmProvider, FieldLlmProvider {
  readonly name = "qwen-openai-compatible";

  private async complete(request: unknown, systemPrompt: string): Promise<string> {
    if (!env.llmEnabled) throw new Error("LLM_ENABLED=false; Qwen provider çağrısı engellendi.");
    if (!env.llmBaseUrl) throw new Error("LLM_BASE_URL yapılandırılmamış.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.llmTimeoutMs);
    try {
      const response = await fetch(`${env.llmBaseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(env.llmApiKey ? { authorization: `Bearer ${env.llmApiKey}` } : {}) },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.llmModel,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify(request) }]
        })
      });
      if (!response.ok) throw new Error(`Qwen HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("Qwen response content boş.");
      return content;
    } finally { clearTimeout(timeout); }
  }

  async resolveCandidates(request: LlmResolveRequest): Promise<LlmResolveResponse> {
    const content = await this.complete(request, "You are a deterministic IDP resolver. Return JSON only. Never invent values not present in candidates. If ambiguity remains, return REVIEW_REQUIRED.");
    return { ...parseSegmentResponse(content), model: env.llmModel, provider: this.name };
  }

  async resolveFieldCandidates(request: FieldLlmResolveRequest): Promise<FieldLlmResolveResponse> {
    const content = await this.complete(request, "You are an evidence-constrained IDP field resolver. Return JSON only. For each ambiguous field, select only an existing candidateId supplied for that exact field. Never output or invent a replacement field value. If evidence is insufficient, return REVIEW_REQUIRED.");
    return { ...parseFieldResponse(content), model: env.llmModel, provider: this.name };
  }
}
