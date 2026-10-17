import { env } from "../../../config/env.js";
import {
  InvoiceLlmExtractionDecision,
  type InvoiceLlmEvidenceRef,
  type InvoiceLlmExtractedField,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse
} from "../domain/invoiceLlmExtraction.types.js";

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function ollamaBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "").replace(/\/v1$/, "");
}

function requestedFieldMatches(requested: readonly string[], actual: string): boolean {
  return requested.some(pattern => {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "\\d+");
    return new RegExp(`^${escaped}$`).test(actual);
  });
}

function normalizeEvidence(field: string, raw: unknown): InvoiceLlmEvidenceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (!item || typeof item !== "object") throw new Error(`Foundation 8 text specialist evidence invalid: ${field}`);
    const evidence = item as Partial<InvoiceLlmEvidenceRef>;
    if (!Number.isInteger(evidence.pageNumber) || Number(evidence.pageNumber) < 1) {
      throw new Error(`Foundation 8 text specialist pageNumber invalid: ${field}`);
    }
    if (!evidence.source || !["NATIVE_TEXT", "OCR", "VERIFIED_KNOWLEDGE"].includes(evidence.source)) {
      throw new Error(`Foundation 8 text specialist evidence source invalid: ${field}`);
    }
    return {
      pageNumber: Number(evidence.pageNumber),
      source: evidence.source,
      ...(typeof evidence.quote === "string" && evidence.quote.trim() ? { quote: evidence.quote.trim() } : {})
    };
  });
}

function parseTextSpecialistResponse(content: string, request: InvoiceLlmExtractionRequest): Omit<InvoiceLlmExtractionResponse, "model" | "provider"> {
  const parsed = JSON.parse(stripFence(content)) as Partial<InvoiceLlmExtractionResponse>;
  const rawVersion = (parsed as { version?: unknown }).version;
  if (rawVersion !== "1" && rawVersion !== 1) throw new Error("Foundation 8 text specialist response version invalid.");
  if (![InvoiceLlmExtractionDecision.EXTRACTED, InvoiceLlmExtractionDecision.PARTIAL, InvoiceLlmExtractionDecision.REVIEW_REQUIRED].includes(parsed.decision as never)) {
    throw new Error("Foundation 8 text specialist decision invalid.");
  }
  if (!Array.isArray(parsed.fields) || !Array.isArray(parsed.issues)) throw new Error("Foundation 8 text specialist response contract incomplete.");

  const seen = new Set<string>();
  const fields: InvoiceLlmExtractedField[] = parsed.fields.map(raw => {
    if (!raw || typeof raw.field !== "string" || !requestedFieldMatches(request.requestedFields, raw.field)) {
      throw new Error(`Foundation 8 text specialist returned unrequested field: ${raw?.field ?? "<empty>"}`);
    }
    if (seen.has(raw.field)) throw new Error(`Foundation 8 text specialist duplicate field: ${raw.field}`);
    seen.add(raw.field);
    if (typeof raw.confidence !== "number" || raw.confidence < 0 || raw.confidence > 1) {
      throw new Error(`Foundation 8 text specialist confidence invalid: ${raw.field}`);
    }
    return { field: raw.field, value: raw.value, confidence: raw.confidence, evidence: normalizeEvidence(raw.field, raw.evidence) };
  });

  return {
    version: "1",
    decision: parsed.decision!,
    fields,
    issues: parsed.issues.map(issue => ({ code: String(issue?.code ?? "UNKNOWN"), message: String(issue?.message ?? "") }))
  };
}

/** Text-only provider for Foundation 8 bounded specialists. It never accepts page images. */
export class QwenTextInvoiceProvider implements InvoiceLlmExtractionProvider {
  readonly name = "qwen-ollama-text-specialist";

  async extractInvoice(request: InvoiceLlmExtractionRequest): Promise<InvoiceLlmExtractionResponse> {
    if (!env.llmEnabled) throw new Error("LLM_ENABLED=false; Foundation 8 text specialist call blocked.");
    if (!env.llmBaseUrl.trim()) throw new Error("LLM_BASE_URL is not configured.");
    if (!env.foundation8SpecialistModel.trim()) throw new Error("FOUNDATION8_SPECIALIST_MODEL is not configured.");
    if (request.evidenceMode !== "TEXT") throw new Error(`Foundation 8 text specialist accepts TEXT evidence only (received=${request.evidenceMode}).`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.llmTimeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(`${ollamaBaseUrl(env.llmBaseUrl)}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(env.llmApiKey ? { authorization: `Bearer ${env.llmApiKey}` } : {}) },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.foundation8SpecialistModel,
          stream: false,
          think: false,
          format: "json",
          options: { temperature: 0, num_ctx: 16384, num_predict: 4096 },
          messages: [
            {
              role: "system",
              content: [
                "You are a bounded invoice specialist in an evidence-constrained IDP pipeline.",
                "Return JSON only with: version, decision, fields, issues.",
                "Each field must contain field, value, confidence, evidence[].",
                "Use only requested fields. For goods wildcard fields, replace * with the zero-based commercial row index.",
                "Evidence must cite a real pageNumber and source NATIVE_TEXT, OCR, or VERIFIED_KNOWLEDGE.",
                "Never manufacture missing values. If source evidence is ambiguous, omit the field and use PARTIAL or REVIEW_REQUIRED."
              ].join(" ")
            },
            {
              role: "user",
              content: JSON.stringify({
                version: request.version,
                documentId: request.documentId,
                evidenceMode: request.evidenceMode,
                requestedFields: request.requestedFields,
                instruction: request.focusInstruction,
                nativeText: request.nativeText,
                ocrText: request.ocrText,
                verifiedKnowledge: request.verifiedKnowledge
              })
            }
          ]
        })
      });
      if (!response.ok) throw new Error(`Foundation 8 text specialist HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json() as { message?: { content?: string } };
      const content = payload.message?.content?.trim();
      if (!content) throw new Error("Foundation 8 text specialist response content empty.");
      const parsed = parseTextSpecialistResponse(content, request);
      console.info("idp.foundation8_text_specialist.completed", {
        documentId: request.documentId,
        model: env.foundation8SpecialistModel,
        elapsedMs: Date.now() - startedAt,
        decision: parsed.decision,
        fieldCount: parsed.fields.length
      });
      return { ...parsed, model: env.foundation8SpecialistModel, provider: this.name };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createFoundation8SpecialistProvider(): InvoiceLlmExtractionProvider {
  return new QwenTextInvoiceProvider();
}
