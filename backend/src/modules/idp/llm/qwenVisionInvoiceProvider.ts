import http from "node:http";
import https from "node:https";
import { env } from "../../../config/env.js";
import {
  InvoiceLlmEvidenceMode,
  InvoiceLlmExtractionDecision,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmExtractionResponse,
  type InvoiceLlmPageImage
} from "../domain/invoiceLlmExtraction.types.js";
import { INVOICE_EXTRACTION_SKILL_VERSION, INVOICE_EXTRACTION_SYSTEM_PROMPT } from "./invoiceExtractionSkill.js";

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}


type NaturalGoodsLine = {
  productCode?: unknown;
  description?: unknown;
  hsCode?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
  origin?: unknown;
};

type NaturalCriticalScalarEvidence = {
  label?: unknown;
  rawValue?: unknown;
};

type NaturalInvoice = {
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  seller?: unknown;
  buyer?: unknown;
  currency?: unknown;
  deliveryTerm?: unknown;
  transportMode?: unknown;
  origin?: unknown;
  grossKg?: unknown;
  netKg?: unknown;
  criticalScalarEvidence?: {
    invoiceDate?: NaturalCriticalScalarEvidence;
    currency?: NaturalCriticalScalarEvidence;
  };
  goodsLines?: unknown;
};

const GOODS_PREFIX = "goodsLines[].";

function naturalScalar(value: unknown): string | number | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

/**
 * Qwen Vision occasionally drops one leading zero from the 9-digit sequence
 * portion of a Turkish-style 16-character invoice identifier. Repair only the
 * narrow, structurally unambiguous 15-character shape (AAA + YYYY + 8 digits).
 * Arbitrary/foreign invoice identifiers are returned untouched.
 */
export function canonicalizeVisionInvoiceNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Za-z0-9]{3})(20\d{2})(\d{8})$/);
  if (!match) return value;
  return `${match[1]}${match[2]}0${match[3]}`;
}


export function criticalScalarEvidenceQuote(parsed: NaturalInvoice, field: "invoiceDate" | "currency"): string | undefined {
  const evidence = parsed.criticalScalarEvidence?.[field];
  if (!evidence || typeof evidence !== "object") return undefined;
  const label = typeof evidence.label === "string" ? evidence.label.trim() : "";
  const rawValue = typeof evidence.rawValue === "string" ? evidence.rawValue.trim() : "";
  if (!label || !rawValue) return undefined;
  return `${label}: ${rawValue}`;
}

function adaptNaturalInvoiceResponse(
  parsed: NaturalInvoice,
  request: InvoiceLlmExtractionRequest,
  pageImages: InvoiceLlmPageImage[]
): Omit<InvoiceLlmExtractionResponse, "model" | "provider"> {
  const goodsLines: NaturalGoodsLine[] = Array.isArray(parsed.goodsLines)
    ? parsed.goodsLines.filter((line): line is NaturalGoodsLine => Boolean(line) && typeof line === "object" && !Array.isArray(line))
    : [];

  const pageNumber = pageImages.length === 1 ? pageImages[0]!.pageNumber : undefined;
  const fields: InvoiceLlmExtractionResponse["fields"] = [];

  for (const requestedField of request.requestedFields) {
    let value: unknown;
    if (requestedField.startsWith(GOODS_PREFIX)) {
      const key = requestedField.slice(GOODS_PREFIX.length) as keyof NaturalGoodsLine;
      value = goodsLines.map((line) => naturalScalar(line[key]) ?? null);
      if ((value as unknown[]).every((item) => item === null)) continue;
    } else {
      value = naturalScalar(parsed[requestedField as keyof NaturalInvoice]);
      if (requestedField === "invoiceNumber") value = canonicalizeVisionInvoiceNumber(value);
      if (value === null || value === undefined) continue;
      if ((requestedField === "invoiceDate" || requestedField === "currency") && !criticalScalarEvidenceQuote(parsed, requestedField)) continue;
    }

    const quote = requestedField === "invoiceDate" || requestedField === "currency"
      ? criticalScalarEvidenceQuote(parsed, requestedField)
      : undefined;
    const evidence = pageNumber
      ? [{ pageNumber, source: "PAGE_IMAGE" as const, ...(quote ? { quote } : {}) }]
      : [];
    fields.push({
      field: requestedField,
      value: value as never,
      confidence: 1,
      evidence
    });
  }

  return {
    version: "1",
    decision: fields.length === request.requestedFields.length
      ? InvoiceLlmExtractionDecision.EXTRACTED
      : fields.length > 0
        ? InvoiceLlmExtractionDecision.PARTIAL
        : InvoiceLlmExtractionDecision.REVIEW_REQUIRED,
    fields,
    issues: []
  };
}

function parseResponse(
  content: string,
  request: InvoiceLlmExtractionRequest,
  pageImages: InvoiceLlmPageImage[],
  diagnostics?: { doneReason?: string; done?: boolean; evalCount?: number }
): Omit<InvoiceLlmExtractionResponse, "model" | "provider"> {
  const stripped = stripFence(content);
  let parsed: Partial<InvoiceLlmExtractionResponse>;
  try {
    parsed = JSON.parse(stripped) as Partial<InvoiceLlmExtractionResponse>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const likelyTruncated = diagnostics?.doneReason === "length" || diagnostics?.done === false || !/[}\]]\s*$/.test(stripped);
    throw new Error(
      `Invoice vision LLM malformed JSON (transport=ollama-native, done=${diagnostics?.done ?? "unknown"}, done_reason=${diagnostics?.doneReason ?? "unknown"}, contentBytes=${Buffer.byteLength(content, "utf8")}, evalCount=${diagnostics?.evalCount ?? "unknown"}, likelyTruncated=${likelyTruncated}): ${message}`
    );
  }
  // Product E2E 1.3.7: the vision model speaks a simple natural invoice
  // JSON shape. The provider owns the deterministic conversion into the
  // strict internal FieldCandidate-style response contract.
  if (!Array.isArray((parsed as { fields?: unknown }).fields)) {
    return adaptNaturalInvoiceResponse(parsed as unknown as NaturalInvoice, request, pageImages);
  }

  const rawVersion = (parsed as { version?: unknown }).version;
  if (rawVersion !== "1" && rawVersion !== 1) throw new Error("Invoice vision LLM response version geçersiz.");
  if (![InvoiceLlmExtractionDecision.EXTRACTED, InvoiceLlmExtractionDecision.PARTIAL, InvoiceLlmExtractionDecision.REVIEW_REQUIRED].includes(parsed.decision as never)) {
    throw new Error("Invoice vision LLM response decision geçersiz.");
  }
  if (!Array.isArray(parsed.fields) || !Array.isArray(parsed.issues)) throw new Error("Invoice vision LLM response contract eksik.");

  const allowedFields = new Set(request.requestedFields);
  const imagePages = new Set(pageImages.map((image) => image.pageNumber));
  const seenFields = new Set<string>();
  const normalizedFields = parsed.fields.map((field) => {
    if (!field || typeof field.field !== "string" || !allowedFields.has(field.field)) throw new Error(`Invoice vision LLM beklenmeyen field döndürdü: ${field?.field ?? "<empty>"}`);
    if (seenFields.has(field.field)) throw new Error(`Invoice vision LLM duplicate field döndürdü: ${field.field}`);
    seenFields.add(field.field);
    if (field.field.includes("goodsLines[]") && !Array.isArray(field.value)) throw new Error(`Invoice vision LLM goodsLines[] field array olmalı: ${field.field}`);
    if (!field.field.includes("goodsLines[]") && Array.isArray(field.value)) throw new Error(`Invoice vision LLM document field scalar olmalı: ${field.field}`);
    if (typeof field.confidence !== "number" || field.confidence < 0 || field.confidence > 1) throw new Error(`Invoice vision LLM confidence geçersiz: ${field.field}`);

    const rawEvidence = Array.isArray(field.evidence) ? field.evidence : [];
    const normalizedEvidence = rawEvidence.map((evidence) => {
      if (!evidence || typeof evidence !== "object") throw new Error(`Invoice vision LLM evidence geçersiz: ${field.field}`);
      if (!["NATIVE_TEXT", "OCR", "PAGE_IMAGE", "VERIFIED_KNOWLEDGE"].includes(evidence.source)) throw new Error(`Invoice vision LLM evidence source geçersiz: ${field.field}`);
      if (!Number.isInteger(evidence.pageNumber) || evidence.pageNumber < 1) throw new Error(`Invoice vision LLM pageNumber geçersiz: ${field.field}`);
      return evidence;
    });

    if (request.evidenceMode === InvoiceLlmEvidenceMode.PAGE_IMAGE) {
      // PAGE_IMAGE provenance is transport-owned, not model-owned. The provider
      // knows exactly which rendered pages were supplied. With a single image
      // it can safely normalize missing/wrong source/page metadata. For a
      // multi-page request the model must still identify a supplied page so we
      // never fabricate ambiguous provenance.
      if (pageImages.length === 1) {
        const pageNumber = pageImages[0]!.pageNumber;
        const quote = rawEvidence.find((e) => e && typeof e === "object" && typeof e.quote === "string" && e.quote.trim())?.quote;
        return {
          ...field,
          evidence: [{ pageNumber, source: "PAGE_IMAGE" as const, ...(quote ? { quote } : {}) }]
        };
      }

      const pageImageEvidence = normalizedEvidence
        .filter((evidence) => evidence.source === "PAGE_IMAGE" && imagePages.has(evidence.pageNumber));
      if (pageImageEvidence.length === 0) throw new Error(`PAGE_IMAGE extraction multi-page evidence belirsiz: ${field.field}`);
      return { ...field, evidence: pageImageEvidence };
    }

    if (normalizedEvidence.length === 0) throw new Error(`Invoice vision LLM evidence eksik: ${field.field}`);
    for (const evidence of normalizedEvidence) {
      if (evidence.source === "PAGE_IMAGE" && !imagePages.has(evidence.pageNumber)) throw new Error(`Invoice vision LLM render edilmemiş sayfayı evidence gösterdi: ${field.field}`);
    }
    return { ...field, evidence: normalizedEvidence };
  });

  return {
    version: "1",
    decision: parsed.decision!,
    fields: normalizedFields,
    issues: parsed.issues as Array<{ code: string; message: string }>
  };
}


async function postJsonForLongInference(
  urlValue: string,
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<{ status: number; text: string }> {
  const url = new URL(urlValue);
  const transport = url.protocol === "https:" ? https : http;
  const payload = JSON.stringify(body);

  return await new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-length": Buffer.byteLength(payload).toString()
      },
      signal
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end(payload);
  });
}

function ollamaBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "").replace(/\/v1$/, "");
}

function ollamaImage(image: InvoiceLlmPageImage): string {
  return image.bytes.toString("base64");
}

/**
 * Ollama-native multimodal invoice extractor for a local vision-capable
 * Qwen runtime. The native /api/chat transport is intentional: it exposes
 * image inputs, structured JSON mode and thinking control directly. This provider extracts candidates/evidence only; it has no
 * normalized-data write path.
 */
export class QwenVisionInvoiceProvider implements InvoiceLlmExtractionProvider {
  readonly name = "qwen-ollama-vision";

  async extractInvoice(request: InvoiceLlmExtractionRequest, pageImages: InvoiceLlmPageImage[] = []): Promise<InvoiceLlmExtractionResponse> {
    if (!env.llmEnabled) throw new Error("LLM_ENABLED=false; vision extraction çağrısı engellendi.");
    if (!env.llmVisionEnabled) throw new Error("LLM_VISION_ENABLED=false; PAGE_IMAGE extraction çağrısı engellendi.");
    if (!env.llmBaseUrl) throw new Error("LLM_BASE_URL yapılandırılmamış.");
    if (!env.llmVisionModel.trim()) throw new Error("LLM_VISION_MODEL yapılandırılmamış.");

    const needsImages = request.evidenceMode === InvoiceLlmEvidenceMode.PAGE_IMAGE || request.evidenceMode === InvoiceLlmEvidenceMode.HYBRID;
    if (needsImages && pageImages.length === 0) throw new Error("Vision extraction için page image gerekli.");
    if (pageImages.length > env.llmVisionMaxPages) throw new Error(`Vision extraction page budget aşıldı (${pageImages.length}/${env.llmVisionMaxPages}).`);
    for (const image of pageImages) {
      if (image.bytes.length <= 0 || image.bytes.length > env.llmVisionMaxImageBytes) throw new Error(`Vision image byte budget geçersiz (page=${image.pageNumber}).`);
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeoutMs = env.llmVisionTimeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const userText = JSON.stringify({
        version: request.version,
        documentId: request.documentId,
        evidenceMode: request.evidenceMode,
        requestedFields: request.requestedFields,
        instruction: "Return the simple invoice JSON shape and populate only data corresponding to requestedFields.",
        nativeText: request.nativeText,
        ocrText: request.ocrText,
        verifiedKnowledge: request.verifiedKnowledge,
        pageImages: pageImages.map((image) => ({ pageNumber: image.pageNumber, source: "PAGE_IMAGE" }))
      });
      const response = await postJsonForLongInference(
        `${ollamaBaseUrl(env.llmBaseUrl)}/api/chat`,
        {
          model: env.llmVisionModel,
          stream: false,
          think: false,
          format: "json",
          options: {
            temperature: 0,
            // Ollama's effective context can otherwise be exhausted by the
            // page image + prompt before the compact JSON finishes.
            num_ctx: 8192,
            num_predict: 4096
          },
          messages: [
            { role: "system", content: INVOICE_EXTRACTION_SYSTEM_PROMPT },
            {
              role: "user",
              content: userText,
              ...(pageImages.length > 0 ? { images: pageImages.map(ollamaImage) } : {})
            }
          ]
        },
        { "content-type": "application/json", ...(env.llmApiKey ? { authorization: `Bearer ${env.llmApiKey}` } : {}) },
        controller.signal
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Qwen vision HTTP ${response.status}: ${response.text.slice(0, 500)}`);
      }
      const payload = JSON.parse(response.text) as {
        message?: { content?: string; thinking?: string };
        done?: boolean;
        done_reason?: string;
        eval_count?: number;
      };
      const content = payload.message?.content?.trim();
      if (!content) {
        const thinkingBytes = Buffer.byteLength(payload.message?.thinking ?? "", "utf8");
        throw new Error(`Qwen vision response content boş (transport=ollama-native, done_reason=${payload.done_reason ?? "unknown"}, thinkingBytes=${thinkingBytes}).`);
      }
      const parsedResponse = parseResponse(content, request, pageImages, {
        done: payload.done,
        doneReason: payload.done_reason,
        evalCount: payload.eval_count
      });
      return {
        ...parsedResponse,
        model: env.llmVisionModel,
        provider: this.name,
        extractionArtifact: {
          version: "1",
          provider: this.name,
          model: env.llmVisionModel,
          skillVersion: INVOICE_EXTRACTION_SKILL_VERSION,
          documentId: request.documentId,
          evidenceMode: request.evidenceMode,
          requestedFields: [...request.requestedFields],
          pageNumbers: pageImages.map((image) => image.pageNumber),
          rawModelResponse: content,
          parsedSemanticResponse: {
            version: parsedResponse.version,
            decision: parsedResponse.decision,
            fields: parsedResponse.fields,
            issues: parsedResponse.issues
          }
        }
      };
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const name = error instanceof Error ? error.name.toLowerCase() : "";
      const message = error instanceof Error ? error.message : String(error);
      const normalized = message.toLowerCase();
      const aborted = name === "aborterror" || normalized.includes("aborted") || normalized.includes("canceled") || normalized.includes("cancelled");
      if (aborted) {
        const pages = pageImages.map((image) => image.pageNumber).join(",") || "none";
        throw new Error(`Qwen vision timeout/abort (model=${env.llmVisionModel}, pages=${pages}, timeoutMs=${timeoutMs}, elapsedMs=${elapsedMs}): ${message}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
