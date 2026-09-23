import { env } from "../../../config/env.js";

export type QwenRuntimeReadiness =
  | { status: "DISABLED"; provider: "qwen-openai-compatible"; networkCalled: false }
  | { status: "NOT_READY"; provider: "qwen-openai-compatible"; networkCalled: boolean; reason: string }
  | { status: "READY"; provider: "qwen-openai-compatible"; networkCalled: true; baseUrl: string; configuredModel: string; advertisedModelIds: string[] };

function validateBaseUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Foundation 8.6 runtime-readiness probe for the external/local Qwen server.
 * This is deliberately read-only: it never sends declaration evidence and it
 * never calls chat/completions. It only verifies the OpenAI-compatible model
 * discovery boundary before production LLM assistance is enabled.
 */
export async function probeQwenRuntimeReadiness(): Promise<QwenRuntimeReadiness> {
  if (!env.llmEnabled) return { status: "DISABLED", provider: "qwen-openai-compatible", networkCalled: false };

  const baseUrl = env.llmBaseUrl.trim();
  if (!validateBaseUrl(baseUrl)) {
    return { status: "NOT_READY", provider: "qwen-openai-compatible", networkCalled: false, reason: "LLM_BASE_URL must be an absolute http(s) URL." };
  }
  if (!env.llmModel.trim()) {
    return { status: "NOT_READY", provider: "qwen-openai-compatible", networkCalled: false, reason: "LLM_MODEL is empty." };
  }
  if (!Number.isFinite(env.llmTimeoutMs) || env.llmTimeoutMs <= 0) {
    return { status: "NOT_READY", provider: "qwen-openai-compatible", networkCalled: false, reason: "LLM_TIMEOUT_MS must be greater than zero." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.llmTimeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/models`, {
      method: "GET",
      headers: env.llmApiKey ? { authorization: `Bearer ${env.llmApiKey}` } : undefined,
      signal: controller.signal
    });
    if (!response.ok) {
      return { status: "NOT_READY", provider: "qwen-openai-compatible", networkCalled: true, reason: `Qwen model discovery HTTP ${response.status}.` };
    }
    const payload = await response.json() as { data?: Array<{ id?: unknown }> };
    const advertisedModelIds = Array.isArray(payload.data)
      ? payload.data.map((item) => typeof item?.id === "string" ? item.id : "").filter(Boolean)
      : [];
    if (!advertisedModelIds.includes(env.llmModel)) {
      return {
        status: "NOT_READY",
        provider: "qwen-openai-compatible",
        networkCalled: true,
        reason: `Configured model '${env.llmModel}' is not advertised by /v1/models.`
      };
    }
    return {
      status: "READY",
      provider: "qwen-openai-compatible",
      networkCalled: true,
      baseUrl,
      configuredModel: env.llmModel,
      advertisedModelIds
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "NOT_READY", provider: "qwen-openai-compatible", networkCalled: true, reason: `Qwen runtime probe failed: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}
