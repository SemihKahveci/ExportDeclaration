import { env } from "../../../config/env.js";
import { LlmResolveDecision, type LlmProvider, type LlmResolveRequest, type LlmResolveResponse } from "../domain/llmResolve.types.js";

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function parseResponse(content: string): Omit<LlmResolveResponse, "model" | "provider"> {
  const parsed = JSON.parse(stripFence(content)) as Partial<LlmResolveResponse>;
  if (parsed.version !== "1") throw new Error("LLM response version geçersiz.");
  if (parsed.decision !== LlmResolveDecision.RESOLVED && parsed.decision !== LlmResolveDecision.REVIEW_REQUIRED) {
    throw new Error("LLM response decision geçersiz.");
  }
  if (!Array.isArray(parsed.sourceSegmentIds) || !Array.isArray(parsed.issues)) {
    throw new Error("LLM response contract eksik.");
  }
  if (parsed.decision === LlmResolveDecision.RESOLVED && (!parsed.data || typeof parsed.data !== "object")) {
    throw new Error("RESOLVED LLM response data içermeli.");
  }
  return {
    version: "1",
    decision: parsed.decision,
    sourceSegmentIds: parsed.sourceSegmentIds,
    data: parsed.data,
    issues: parsed.issues as Array<{ code: string; message: string }>
  };
}

export class QwenOpenAiProvider implements LlmProvider {
  readonly name = "qwen-openai-compatible";

  async resolveCandidates(request: LlmResolveRequest): Promise<LlmResolveResponse> {
    if (!env.llmEnabled) throw new Error("LLM_ENABLED=false; Qwen provider çağrısı engellendi.");
    if (!env.llmBaseUrl) throw new Error("LLM_BASE_URL yapılandırılmamış.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.llmTimeoutMs);
    try {
      const response = await fetch(`${env.llmBaseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.llmApiKey ? { authorization: `Bearer ${env.llmApiKey}` } : {})
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.llmModel,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are a deterministic IDP resolver. Return JSON only. Never invent values not present in candidates. If ambiguity remains, return REVIEW_REQUIRED."
            },
            { role: "user", content: JSON.stringify(request) }
          ]
        })
      });
      if (!response.ok) throw new Error(`Qwen HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("Qwen response content boş.");
      return { ...parseResponse(content), model: env.llmModel, provider: this.name };
    } finally {
      clearTimeout(timeout);
    }
  }
}
