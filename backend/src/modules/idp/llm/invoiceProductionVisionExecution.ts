import type { CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  InvoiceLlmEvidenceMode,
  type InvoiceLlmExtractionArtifact,
  type InvoiceLlmExtractionProvider,
  type InvoiceLlmExtractionRequest,
  type InvoiceLlmPageImage
} from "../domain/invoiceLlmExtraction.types.js";
import {
  mergeInvoiceCandidateSources,
  projectVisionResponseToFieldCandidates
} from "./invoiceProductionExtractionOrchestrator.js";
import { INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION } from "./invoiceExtractionSkill.js";

export interface InvoiceVisionPageRenderer {
  (pageNumber: number): Promise<InvoiceLlmPageImage>;
}

export interface InvoiceVisionCheckpoint {
  pageNumber: number;
  decision: string;
  candidateCount: number;
  extractionArtifact?: InvoiceLlmExtractionArtifact;
  extractionArtifacts?: InvoiceLlmExtractionArtifact[];
  recoveryDiagnostic?: {
    focusedRecoveryAttempted: boolean;
    focusedRecoveryUsed: boolean;
    scalarRecoveryRequestedFields: string[];
    scalarRecoveryAttempted: boolean;
    scalarRecoveryDecision?: string;
    scalarRecoveryReturnedFields: string[];
    scalarRecoveryError?: string;
    criticalScalarRecoveryRequestedFields: string[];
    criticalScalarRecoveryAttempted: boolean;
    criticalScalarRecoveryDecision?: string;
    criticalScalarRecoveryReturnedFields: string[];
    criticalScalarRecoveryError?: string;
    originRecoveryAttempted: boolean;
    originRecoveryDecision?: string;
    originRecoveryReturned: boolean;
    originRecoveryError?: string;
    goodsNumericRecoveryTriggered: boolean;
    goodsNumericRecoveryReasons: string[];
    goodsNumericRecoveryAttempted: boolean;
    goodsNumericRecoveryDecision?: string;
    goodsNumericRecoveryReturnedFields: string[];
    goodsNumericRecoveryError?: string;
    shipmentWeightRecoveryTriggered: boolean;
    shipmentWeightRecoveryReasons: string[];
    shipmentWeightRecoveryAttempted: boolean;
    shipmentWeightRecoveryDecision?: string;
    shipmentWeightRecoveryReturnedFields: string[];
    shipmentWeightRecoveryError?: string;
    shipmentWeightTextFallbackReturnedFields: string[];
    shipmentWeightTextFallbackSources: string[];
  };
}

export interface InvoiceProductionVisionExecution {
  candidates: FieldCandidateEnvelope;
  checkpoints: InvoiceVisionCheckpoint[];
  failedPages: Array<{ pageNumber: number; error: string }>;
}

/**
 * Production-safe bounded Vision execution.
 *
 * Each page is its own inference/checkpoint boundary. A page failure is
 * recorded and does not discard candidates already extracted from other
 * pages. The returned candidates are still ordinary peer candidates; this
 * function has no persistence or normalized-data authority.
 */
export async function executeInvoiceVisionByPage(params: {
  canonicalDocument: CanonicalDocument;
  segmentId: string;
  pageNumbers: number[];
  provider: InvoiceLlmExtractionProvider;
  renderPage: InvoiceVisionPageRenderer;
  request: Omit<InvoiceLlmExtractionRequest, "documentId" | "evidenceMode">;
  completedPages?: Record<number, { candidates: FieldCandidateEnvelope; decision: string; candidateCount: number; extractionArtifact?: InvoiceLlmExtractionArtifact }>;
  onPageCheckpoint?: (checkpoint: {
    pageNumber: number;
    status: "COMPLETED" | "FAILED";
    decision?: string;
    candidateCount?: number;
    candidates?: FieldCandidateEnvelope;
    extractionArtifact?: InvoiceLlmExtractionArtifact;
    extractionArtifacts?: InvoiceLlmExtractionArtifact[];
    recoveryDiagnostic?: InvoiceVisionCheckpoint["recoveryDiagnostic"];
    error?: string;
  }) => Promise<void>;
}): Promise<InvoiceProductionVisionExecution> {
  const validPages = new Set(params.canonicalDocument.pages.map((page) => page.pageNumber));
  const sources: FieldCandidateEnvelope[] = [];
  const checkpoints: InvoiceVisionCheckpoint[] = [];
  const failedPages: Array<{ pageNumber: number; error: string }> = [];

  let goodsLineOffset = 0;

  const parseLabelledWeightNumber = (raw: string): number | undefined => {
    const token = raw.trim().replace(/\s+/g, "");
    if (!/^\d[\d.,]*$/.test(token)) return undefined;
    const comma = token.lastIndexOf(",");
    const dot = token.lastIndexOf(".");
    let normalized = token;
    if (comma >= 0 && dot >= 0) {
      const decimalIndex = Math.max(comma, dot);
      const decimalDigits = token.length - decimalIndex - 1;
      if (decimalDigits === 1 || decimalDigits === 2) {
        normalized = token.slice(0, decimalIndex).replace(/[.,]/g, "") + "." + token.slice(decimalIndex + 1);
      } else {
        normalized = token.replace(/[.,]/g, "");
      }
    } else if (comma >= 0 || dot >= 0) {
      const separator = comma >= 0 ? "," : ".";
      const index = token.lastIndexOf(separator);
      const digits = token.length - index - 1;
      normalized = digits === 3 ? token.replace(/[.,]/g, "") : token.replace(separator, ".");
    }
    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  const labelledShipmentWeightFallback = (text: string | undefined, role: "grossKg" | "netKg"): { value: number; quote: string } | undefined => {
    if (!text?.trim()) return undefined;
    const label = role === "grossKg" ? "(?:brüt|brut|gross)" : "(?:net)";
    // Require a weight-shaped label/value expression. This deliberately does
    // not match commercial phrases such as "Toplam Brüt Tutar" because an
    // unrelated word may not occur between the role label and numeric token.
    const patterns = [
      new RegExp(`\\b${label}\\s+(?:weight|ağırlık|agirlik)\\s*[:=\\-]?\\s*([0-9][0-9.,]*)\\s*(?:kg|kgs|kilogram|kilograms)?\\b`, "i"),
      new RegExp(`\\b${label}\\s+(?:kg|kgs|kilogram|kilograms)\\s*[:=\\-]?\\s*([0-9][0-9.,]*)\\b`, "i"),
      new RegExp(`\\b${label}\\s*[:=\\-]?\\s*([0-9][0-9.,]*)\\s*(?:kg|kgs|kilogram|kilograms)\\b`, "i")
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (!match?.[1]) continue;
      const value = parseLabelledWeightNumber(match[1]);
      if (value === undefined) continue;
      return { value, quote: match[0].replace(/\s+/g, " ").trim() };
    }
    return undefined;
  };

  const canonicalPageWeightEvidenceTexts = (page: CanonicalDocument["pages"][number] | undefined): Array<{ text: string; source: "NATIVE_TEXT" | "OCR" }> => {
    if (!page) return [];
    const texts: Array<{ text: string; source: "NATIVE_TEXT" | "OCR" }> = [];
    const seen = new Set<string>();
    const push = (text: string | undefined, source: "NATIVE_TEXT" | "OCR") => {
      const normalized = text?.replace(/\s+/g, " ").trim();
      if (!normalized) return;
      const key = `${source}:${normalized}`;
      if (seen.has(key)) return;
      seen.add(key);
      texts.push({ text: normalized, source });
    };
    push(page.nativeText, "NATIVE_TEXT");
    push(page.ocrText, "OCR");
    for (const line of page.lines ?? []) push(line.text, line.source);

    // PDF text extraction can fragment a visual note into separate words even
    // when nativeText/lines do not preserve the reading order. Reconstruct
    // small same-row windows from canonical positioned words as a final
    // evidence surface. The regex still requires an explicit weight label +
    // KG-shaped expression, so this does not turn arbitrary nearby numbers
    // into shipment-weight authority.
    const words = [...(page.words ?? [])].filter((word) => word.text?.trim());
    // Canonical bbox coordinates are normalized in the IDP candidate layer.
    // 1.6.9.15 accidentally mixed that coordinate space with page pixel/point
    // height via Math.max(2, page.height * 0.004). On a normal PDF this makes
    // the tolerance >= 2 while canonical y coordinates are ~0..1, collapsing
    // essentially the whole page into one synthetic row. Preserve the same
    // normalized geometry convention used by invoiceShipmentCandidateDiscovery.
    const maxCanonicalY = words.reduce((max, word) => Math.max(max, word.bbox.y0, word.bbox.y1), 0);
    const coordinatesAreNormalized = maxCanonicalY <= 2;
    const tolerance = coordinatesAreNormalized
      ? 0.025
      : Math.max(2, page.height * 0.004);
    const rows: typeof words[] = [];
    for (const word of words.sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2) || a.bbox.x0 - b.bbox.x0)) {
      const cy = (word.bbox.y0 + word.bbox.y1) / 2;
      let row = rows.find((candidate) => {
        const first = candidate[0];
        if (!first) return false;
        const fy = (first.bbox.y0 + first.bbox.y1) / 2;
        return Math.abs(fy - cy) <= tolerance;
      });
      if (!row) { row = []; rows.push(row); }
      row.push(word);
    }
    for (const row of rows) {
      row.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const source: "NATIVE_TEXT" | "OCR" = row.some((word) => word.source === "OCR") ? "OCR" : "NATIVE_TEXT";
      push(row.map((word) => word.text).join(" "), source);
    }
    return texts;
  };

  const shipmentWeightAnchorHints = (text: string | undefined): string[] => {
    if (!text?.trim()) return [];
    const normalized = text.replace(/\r/g, "\n");
    const lines = normalized.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const labelPattern = /\b(?:brüt|brut|gross|net)(?:\s+(?:kg|weight|ağırlık|agirlik))?\b/i;
    const hints: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!labelPattern.test(lines[index]!)) continue;
      const window = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join(" | ");
      if (window && !hints.includes(window)) hints.push(window);
      if (hints.length >= 6) break;
    }
    return hints;
  };

  const isRetryableAbort = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    return name === "aborterror"
      || message.includes("operation was aborted")
      || message.includes("operation was canceled")
      || message.includes("operation was cancelled")
      || message.includes("aborted");
  };

  for (const pageNumber of params.pageNumbers) {
    const persisted = params.completedPages?.[pageNumber];
    if (persisted) {
      sources.push(persisted.candidates);
      checkpoints.push({ pageNumber, decision: persisted.decision, candidateCount: persisted.candidateCount, extractionArtifact: persisted.extractionArtifact });
      const persistedGoodsCount = Object.keys(persisted.candidates.fields)
        .map((field) => /^goodsLines\.(\d+)\./.exec(field)?.[1])
        .filter((value): value is string => Boolean(value))
        .reduce((max, value) => Math.max(max, Number(value) + 1), 0);
      goodsLineOffset = Math.max(goodsLineOffset, persistedGoodsCount);
      continue;
    }

    if (!validPages.has(pageNumber)) {
      failedPages.push({ pageNumber, error: "PAGE_NOT_IN_CANONICAL_DOCUMENT" });
      continue;
    }

    const image = await params.renderPage(pageNumber);
    if (image.pageNumber !== pageNumber) {
      const message = `Rendered page mismatch (${image.pageNumber}/${pageNumber}).`;
      failedPages.push({ pageNumber, error: message });
      await params.onPageCheckpoint?.({ pageNumber, status: "FAILED", error: message });
      continue;
    }

    let response: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    let terminalError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        response = await params.provider.extractInvoice({
          ...params.request,
          documentId: `${params.segmentId}:page:${pageNumber}`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        terminalError = undefined;
        break;
      } catch (error) {
        terminalError = error;
        if (attempt >= 2 || !isRetryableAbort(error)) break;
      }
    }

    if (!response) {
      const message = terminalError instanceof Error ? terminalError.message : String(terminalError);
      failedPages.push({ pageNumber, error: message });
      await params.onPageCheckpoint?.({ pageNumber, status: "FAILED", error: message });
      continue;
    }

    let focusedRecoveryUsed = false;
    let focusedRecoveryAttempted = false;
    let scalarRecoveryRequestedFields: string[] = [];
    let scalarRecoveryAttempted = false;
    let scalarRecoveryDecision: string | undefined;
    let scalarRecoveryReturnedFields: string[] = [];
    let scalarRecoveryError: string | undefined;
    let criticalScalarRecoveryRequestedFields: string[] = [];
    let criticalScalarRecoveryAttempted = false;
    let criticalScalarRecoveryDecision: string | undefined;
    let criticalScalarRecoveryReturnedFields: string[] = [];
    let criticalScalarRecoveryError: string | undefined;
    let originRecoveryAttempted = false;
    let originRecoveryDecision: string | undefined;
    let originRecoveryReturned = false;
    let originRecoveryError: string | undefined;
    let goodsNumericRecoveryTriggered = false;
    let goodsNumericRecoveryReasons: string[] = [];
    let goodsNumericRecoveryAttempted = false;
    let goodsNumericRecoveryDecision: string | undefined;
    let goodsNumericRecoveryReturnedFields: string[] = [];
    let goodsNumericRecoveryError: string | undefined;
    const pageArtifacts: InvoiceLlmExtractionArtifact[] = [];
    // 1.6.8.30: persist every recovery model execution, including fail-closed
    // zero-field responses, so real-Qwen failures remain diagnosable.
    const pushArtifact = (artifact: InvoiceLlmExtractionArtifact | undefined): void => {
      if (!artifact) return;
      if (pageArtifacts.some((item) => item.documentId === artifact.documentId)) return;
      pageArtifacts.push(artifact);
    };

    // 1.6.8.21: a completely empty semantic response can happen when the
    // model correctly fails closed on critical scalars but prematurely stops
    // before extracting unrelated page content. Recover with one focused Qwen
    // pass that excludes only the evidence-gated critical scalars. This is not
    // OCR/deterministic authority: the same page image and Qwen provider remain
    // the primary evidence source. Normal non-empty responses pay no retry cost.
    if (response.decision === "REVIEW_REQUIRED" && response.fields.length === 0) {
      const recoveryRequestedFields = params.request.requestedFields.filter(
        (field) => field !== "invoiceDate" && field !== "currency"
      );
      if (recoveryRequestedFields.length > 0) {
        focusedRecoveryAttempted = true;
        try {
          const recovery = await params.provider.extractInvoice({
            ...params.request,
            requestedFields: recoveryRequestedFields,
            focusInstruction: "This is a focused non-critical recovery pass. Inspect the entire page for every requested field independently. Do not stop after extracting goods lines. Also inspect headers, footers, totals and summary areas for requested scalar fields such as gross/net weight, origin and delivery terms. Return null/omit only when a requested value is not visibly supported.",
            documentId: `${params.segmentId}:page:${pageNumber}:non-critical-recovery`,
            evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
          }, [image]);
          pushArtifact(recovery.extractionArtifact);
          if (recovery.fields.length > 0) {
            response = recovery;
            focusedRecoveryUsed = true;
          }
        } catch {
          // The original fail-closed response remains authoritative when the
          // focused recovery call itself fails. Page-level execution continues.
        }
      }
    }

    pushArtifact(response.extractionArtifact);

    // 1.6.8.26: any usable Qwen page response may still omit independent
    // non-critical scalar fields while successfully extracting other content
    // (especially large goods tables). Ask Qwen at most once more, on the same
    // page image, only for requested scalar fields that are still missing.
    // Existing fields are never re-requested or overwritten; goods fields and
    // evidence-gated critical scalars remain excluded. Empty/fail-closed page
    // responses do not trigger this pass.
    let scalarResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    if (response.fields.length > 0) {
      const returnedFields = new Set(response.fields.map((field) => field.field));
      const scalarRequestedFields = params.request.requestedFields.filter(
        (field) => field !== "invoiceDate"
          && field !== "currency"
          && !field.startsWith("goodsLines[].")
          && !returnedFields.has(field)
      );
      scalarRecoveryRequestedFields = [...scalarRequestedFields];
      if (scalarRequestedFields.length > 0) {
        scalarRecoveryAttempted = true;
        try {
          const scalarRecovery = await params.provider.extractInvoice({
            ...params.request,
            requestedFields: scalarRequestedFields,
            focusInstruction: INVOICE_SCALAR_RECOVERY_FOCUS_INSTRUCTION,
            documentId: `${params.segmentId}:page:${pageNumber}:non-critical-scalar-recovery`,
            evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
          }, [image]);
          scalarRecoveryDecision = scalarRecovery.decision;
          scalarRecoveryReturnedFields = scalarRecovery.fields.map((field) => field.field);
          pushArtifact(scalarRecovery.extractionArtifact);
          if (scalarRecovery.fields.length > 0) {
            scalarResponse = scalarRecovery;
          }
        } catch (error) {
          scalarRecoveryError = error instanceof Error ? error.message : String(error);
          // Preserve the successful goods/non-critical recovery if this narrow
          // scalar pass fails. Missing scalars remain fail-closed.
        }
      }
    }

    // 1.6.9.2: invoiceDate and currency are evidence-gated critical scalars.
    // The normal non-critical recovery deliberately excludes them, which left
    // a repeated generalization gap on otherwise successful digital invoices.
    // Perform one bounded critical-scalar recovery call only for the critical
    // fields still missing from the current page response. Page-local native/OCR
    // text is assistive reading context only; qwen must still return the compact
    // criticalScalarEvidence required by the provider, and the same page image
    // remains the semantic evidence authority.
    let criticalScalarResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    const criticalCanonicalPage = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
    const criticalReturnedFields = new Set(response.fields.map((field) => field.field));
    const criticalRequestedFields = (["invoiceDate", "currency"] as const).filter(
      (field) => params.request.requestedFields.includes(field) && !criticalReturnedFields.has(field)
    );
    criticalScalarRecoveryRequestedFields = [...criticalRequestedFields];
    if (response.fields.length > 0 && criticalRequestedFields.length > 0) {
      criticalScalarRecoveryAttempted = true;
      try {
        const criticalRecovery = await params.provider.extractInvoice({
          ...params.request,
          requestedFields: [...criticalRequestedFields],
          focusInstruction: [
            "This is a critical-scalar evidence recovery pass for only the requested invoiceDate/currency fields.",
            "Inspect the entire supplied page, especially invoice header, metadata, totals, monetary columns and summary text.",
            "The page-local native/OCR text is assistive reading context for locating small or dense visible text; verify the value against the same supplied page image.",
            "For invoiceDate, extract only the actual invoice issue/date field, not due date, delivery date, order date, reference date or a date embedded into another identifier.",
            "For currency, extract only the invoice monetary currency explicitly supported by visible code/name/context; never infer it from country or locale.",
            "Return the required criticalScalarEvidence label/rawValue exactly from visible page text. If that evidence cannot support the value, return null/omit the field. Never guess."
          ].join(" "),
          nativeText: criticalCanonicalPage?.nativeText?.trim() || "",
          ocrText: criticalCanonicalPage?.ocrText?.trim() || "",
          documentId: `${params.segmentId}:page:${pageNumber}:critical-scalar-evidence-recovery`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        criticalScalarRecoveryDecision = criticalRecovery.decision;
        criticalScalarRecoveryReturnedFields = criticalRecovery.fields.map((field) => field.field);
        pushArtifact(criticalRecovery.extractionArtifact);
        if (criticalRecovery.fields.length > 0) criticalScalarResponse = criticalRecovery;
      } catch (error) {
        criticalScalarRecoveryError = error instanceof Error ? error.message : String(error);
        // Missing critical scalars remain fail-closed when grounded recovery fails.
      }
    }

    // 1.6.8.29: origin is semantically distinct from the other shipment
    // scalars and may be represented by a localized country name or an
    // established language-specific country abbreviation. If the normal and
    // general scalar passes still omit origin, perform one final bounded
    // origin-only Qwen pass on the same page image. Keeping this recovery
    // isolated prevents origin normalization guidance from perturbing goods,
    // weights, dates, currency, or other already-correct fields.
    let originResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    const canonicalPage = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
    const originRecoveryOcrText = canonicalPage?.ocrText?.trim() || "";
    const originRecoveryNativeText = canonicalPage?.nativeText?.trim() || "";
    const responseHasOrigin = response.fields.some((field) => field.field === "origin");
    const scalarHasOrigin = scalarResponse?.fields.some((field) => field.field === "origin") ?? false;
    const originWasRequested = params.request.requestedFields.includes("origin");
    if (originWasRequested && response.fields.length > 0 && !responseHasOrigin && !scalarHasOrigin) {
      originRecoveryAttempted = true;
      try {
        const originRecovery = await params.provider.extractInvoice({
          ...params.request,
          requestedFields: ["origin"],
          focusInstruction: [
            "This is an origin-only evidence recovery pass.",
            "Inspect the entire supplied page only for explicit goods/shipment country of origin (origin/menşe/menşei or semantically equivalent visible context).",
            "The page-local OCR/native text supplied with this request is assistive reading context for small or dense print; use it only to locate a possible origin token and verify that meaning against the same supplied page image.",
            "A visibly supported country name or an established language-specific country abbreviation may support origin when its country meaning is unambiguous.",
            "Normalize an unambiguous country meaning to ISO-3166-1 alpha-2.",
            "Do not use seller, buyer, address, destination, dispatch, bank country, supplier identity, expected answers, or prior documents as origin evidence.",
            "If explicit origin evidence is absent or the country meaning is ambiguous, return origin as null/omit it. Never guess."
          ].join(" "),
          nativeText: originRecoveryNativeText,
          ocrText: originRecoveryOcrText,
          documentId: `${params.segmentId}:page:${pageNumber}:origin-evidence-recovery`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        originRecoveryDecision = originRecovery.decision;
        pushArtifact(originRecovery.extractionArtifact);
        const originField = originRecovery.fields.find((field) => field.field === "origin");
        if (originField) {
          originResponse = { ...originRecovery, fields: [originField] };
          originRecoveryReturned = true;
        }
      } catch (error) {
        originRecoveryError = error instanceof Error ? error.message : String(error);
        // Existing successful extraction remains authoritative. Missing origin
        // stays fail-closed if the isolated recovery cannot establish it.
      }
    }

    // 1.6.9.10: bounded semantic recovery for suspicious goods numerics.
    // Trigger only when the primary Qwen row is internally inconsistent
    // (quantity * unitPrice != lineTotal) or explicitly carries a free-of-charge
    // marker with a non-zero payable total. This is a second Qwen read of the
    // same page image, aided by page-local text; arithmetic is a trigger/check,
    // never an authority. Recovered values replace only the fields Qwen actually
    // returned, then continue through the ordinary F6 candidate path.
    const fieldValue = (field: string): unknown => response?.fields.find((item) => item.field === field)?.value;
    const quantities = Array.isArray(fieldValue("goodsLines[].quantity")) ? fieldValue("goodsLines[].quantity") as unknown[] : [];
    const unitPrices = Array.isArray(fieldValue("goodsLines[].unitPrice")) ? fieldValue("goodsLines[].unitPrice") as unknown[] : [];
    const lineTotals = Array.isArray(fieldValue("goodsLines[].lineTotal")) ? fieldValue("goodsLines[].lineTotal") as unknown[] : [];
    const descriptions = Array.isArray(fieldValue("goodsLines[].description")) ? fieldValue("goodsLines[].description") as unknown[] : [];
    const numericRowCount = Math.max(quantities.length, unitPrices.length, lineTotals.length, descriptions.length);
    for (let index = 0; index < numericRowCount; index += 1) {
      const quantity = typeof quantities[index] === "number" ? quantities[index] as number : undefined;
      const unitPrice = typeof unitPrices[index] === "number" ? unitPrices[index] as number : undefined;
      const lineTotal = typeof lineTotals[index] === "number" ? lineTotals[index] as number : undefined;
      if (quantity !== undefined && unitPrice !== undefined && lineTotal !== undefined) {
        const expected = quantity * unitPrice;
        const tolerance = Math.max(0.01, Math.abs(lineTotal) * 0.005);
        if (Math.abs(expected - lineTotal) > tolerance) goodsNumericRecoveryReasons.push(`ROW_${index}_ARITHMETIC_INCONSISTENT`);
      }
      const description = typeof descriptions[index] === "string" ? descriptions[index] as string : "";
      if (/\b(?:FOC|FREE\s+OF\s+CHARGE|NO\s+CHARGE)\b/i.test(description) && typeof lineTotal === "number" && lineTotal !== 0) {
        goodsNumericRecoveryReasons.push(`ROW_${index}_FREE_OF_CHARGE_NONZERO_TOTAL`);
      }
    }
    goodsNumericRecoveryReasons = [...new Set(goodsNumericRecoveryReasons)];
    goodsNumericRecoveryTriggered = goodsNumericRecoveryReasons.length > 0;

    let numericRecoveryResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;
    if (goodsNumericRecoveryTriggered) {
      goodsNumericRecoveryAttempted = true;
      try {
        const pageContext = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
        const numericRecovery = await params.provider.extractInvoice({
          ...params.request,
          requestedFields: ["grossKg", "netKg", "goodsLines[].description", "goodsLines[].quantity", "goodsLines[].unit", "goodsLines[].unitPrice", "goodsLines[].lineTotal"],
          focusInstruction: [
            "This is a focused goods-numeric semantic recovery pass triggered by an internally suspicious primary extraction.",
            "Re-read the visible commercial table from the supplied page image using its headers and row alignment; the page-local text is assistive reading context only.",
            "Resolve every numeric cell by its visible column header before returning it. Adjacent packaging columns such as Koli/Package/Box/Pallet are packaging counts, not goods quantity. goodsLines[].quantity must come from the commercial Miktar/Quantity column and stay paired with its visible unit.",
            "For every returned goods numeric, also return goodsLines[].evidence with the exact visible header and rawValue token from the same row: quantity {header,rawValue,unit}, unitPrice {header,rawValue}, lineTotal {header,rawValue}. Do not paraphrase headers or repair rawValue. If the header/raw token cannot be identified, return that numeric as null.",
            "For each commercial row, return the visibly supported quantity, unit, unit price and payable line total from that same row. Do not calculate a line total merely from quantity times unit price and do not move values between rows or columns.",
            "Interpret thousands and decimal separators from the document's visible formatting convention before producing JSON numbers. For Turkish/European formatting, 25.000 means 25000 and 17.500,00 means 17500; for English formatting, 25,000 and 17,500.00 mean the corresponding thousands values. Never collapse a thousands-formatted monetary total such as 17.500,00 to 17.5.",
            "FOC/free-of-charge is commercial evidence: if a row is explicitly free of charge, read the actual payable total shown for that row and never replace a visible zero/blank-free total with quantity multiplied by unit price.",
            "grossKg/netKg are shipment-level labelled weights only; never derive them from goods quantity or arithmetic. For each returned shipment weight also return shipmentWeightEvidence.grossKg/netKg with the exact visible label and rawValue. A goods-table Miktar/Quantity header is never gross/net weight evidence.",
            "If a numeric role or value cannot be read confidently from the page, return null for it rather than guessing."
          ].join(" "),
          nativeText: pageContext?.nativeText?.trim() || "",
          ocrText: pageContext?.ocrText?.trim() || "",
          documentId: `${params.segmentId}:page:${pageNumber}:goods-numeric-semantic-recovery`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        goodsNumericRecoveryDecision = numericRecovery.decision;
        goodsNumericRecoveryReturnedFields = numericRecovery.fields.map((field) => field.field);
        pushArtifact(numericRecovery.extractionArtifact);
        if (numericRecovery.fields.length > 0) {
          numericRecoveryResponse = numericRecovery;
          const replacementFields = new Set(numericRecovery.fields.map((field) => field.field).filter((field) =>
            field === "grossKg" || field === "netKg" || field.startsWith("goodsLines[].")
          ));
          response = { ...response, fields: response.fields.filter((field) => !replacementFields.has(field.field)) };
        }
      } catch (error) {
        goodsNumericRecoveryError = error instanceof Error ? error.message : String(error);
      }
    }

    // 1.6.9.12: if a shipment weight is numerically identical to a recovered
    // commercial quantity, treat that as a role-collision signal. Re-read only
    // labelled shipment weights. The dedicated pass is evidence-gated by the
    // provider, so a Miktar/Quantity token can never become gross/net weight.
    const recoveredQuantities = numericRecoveryResponse?.fields.find((field) => field.field === "goodsLines[].quantity")?.value;
    const recoveredQuantityValues = Array.isArray(recoveredQuantities)
      ? recoveredQuantities.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      : [];
    const candidateWeightValues = [
      ...response.fields.filter((field) => field.field === "grossKg" || field.field === "netKg"),
      ...(scalarResponse?.fields.filter((field) => field.field === "grossKg" || field.field === "netKg") ?? [])
    ];
    let shipmentWeightRecoveryReasons = candidateWeightValues
      .filter((field) => typeof field.value === "number" && recoveredQuantityValues.some((quantity) => Math.abs(quantity - (field.value as number)) < 1e-9))
      .map((field) => `${field.field.toUpperCase()}_EQUALS_GOODS_QUANTITY`);
    shipmentWeightRecoveryReasons = [...new Set(shipmentWeightRecoveryReasons)];
    const shipmentWeightRecoveryTriggered = shipmentWeightRecoveryReasons.length > 0;
    let shipmentWeightRecoveryAttempted = false;
    let shipmentWeightRecoveryDecision: string | undefined;
    let shipmentWeightRecoveryReturnedFields: string[] = [];
    let shipmentWeightRecoveryError: string | undefined;
    let shipmentWeightRecoveryResponse: Awaited<ReturnType<InvoiceLlmExtractionProvider["extractInvoice"]>> | undefined;

    if (shipmentWeightRecoveryTriggered) {
      shipmentWeightRecoveryAttempted = true;
      try {
        const pageContext = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
        const weightAnchorHints = [
          ...shipmentWeightAnchorHints(pageContext?.nativeText),
          ...shipmentWeightAnchorHints(pageContext?.ocrText)
        ].filter((hint, index, all) => all.indexOf(hint) === index).slice(0, 6);
        const weightAnchorContext = weightAnchorHints.length > 0
          ? ` Assistive label-anchor snippets located in page-local text: ${weightAnchorHints.map((hint) => `[${hint}]`).join(" ")}. These snippets are navigation hints only: verify the label and raw value against the supplied page image before returning any field.`
          : "";
        const weightRecovery = await params.provider.extractInvoice({
          ...params.request,
          requestedFields: ["grossKg", "netKg"],
          focusInstruction: [
            "This is a focused shipment-weight evidence recovery pass triggered because a previously extracted shipment weight collides numerically with a goods-table quantity.",
            "Inspect the entire supplied page image, especially notes, totals, shipment summaries, headers and footers, only for explicit gross/brüt and net shipment weights.",
            "Return grossKg only from a visibly labelled Gross/Brüt shipment-weight value and netKg only from a visibly labelled Net shipment-weight value.",
            "For every returned value also return shipmentWeightEvidence.grossKg/netKg with the exact visible label and rawValue token. If the label and raw token are not both visible, return null.",
            "Never use Miktar/Quantity/Qty, Koli/Package/Box/Pallet, goods-row quantities, arithmetic, or totals of goods quantities as shipment weight evidence.",
            "Page-local native/OCR text is assistive reading context only; PAGE_IMAGE remains the semantic authority.",
            weightAnchorContext
          ].filter(Boolean).join(" "),
          nativeText: pageContext?.nativeText?.trim() || "",
          ocrText: pageContext?.ocrText?.trim() || "",
          documentId: `${params.segmentId}:page:${pageNumber}:shipment-weight-evidence-recovery`,
          evidenceMode: InvoiceLlmEvidenceMode.PAGE_IMAGE
        }, [image]);
        shipmentWeightRecoveryDecision = weightRecovery.decision;
        shipmentWeightRecoveryReturnedFields = weightRecovery.fields.map((field) => field.field);
        pushArtifact(weightRecovery.extractionArtifact);
        shipmentWeightRecoveryResponse = weightRecovery;

        // Once the role collision is established, unlabeled colliding weights
        // are not authoritative. Remove them from primary/scalar sources; only
        // evidence-gated labelled recovery values may replace them.
        const collidingRoles = new Set(candidateWeightValues
          .filter((field) => typeof field.value === "number" && recoveredQuantityValues.some((quantity) => Math.abs(quantity - (field.value as number)) < 1e-9))
          .map((field) => field.field));
        response = { ...response, fields: response.fields.filter((field) => !collidingRoles.has(field.field)) };
        if (scalarResponse) scalarResponse = { ...scalarResponse, fields: scalarResponse.fields.filter((field) => !collidingRoles.has(field.field)) };
      } catch (error) {
        shipmentWeightRecoveryError = error instanceof Error ? error.message : String(error);
      }
    }

    const projected = projectVisionResponseToFieldCandidates({
      response,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    });
    const scalarProjected = scalarResponse ? projectVisionResponseToFieldCandidates({
      response: scalarResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;
    const criticalScalarProjected = criticalScalarResponse ? projectVisionResponseToFieldCandidates({
      response: criticalScalarResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;
    const originProjected = originResponse ? projectVisionResponseToFieldCandidates({
      response: originResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;

    const numericRecoveryProjected = numericRecoveryResponse ? projectVisionResponseToFieldCandidates({
      response: numericRecoveryResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;
    const shipmentWeightRecoveryProjected = shipmentWeightRecoveryResponse ? projectVisionResponseToFieldCandidates({
      response: shipmentWeightRecoveryResponse,
      segmentId: params.segmentId,
      pageNumber,
      goodsLineOffset
    }) : undefined;

    // 1.6.9.14: deterministic text is a bounded fallback, never the primary
    // shipment-weight authority. It is considered only after a role collision
    // triggered the Qwen recovery and Qwen still produced no evidence-gated
    // candidate for that role. Exact Gross/Brüt/Net + KG-shaped evidence is
    // required; generic quantities and commercial totals cannot qualify.
    const shipmentWeightTextFallback: FieldCandidateEnvelope = { version: "1", fields: {} };
    const shipmentWeightTextFallbackReturnedFields: string[] = [];
    const shipmentWeightTextFallbackSources: string[] = [];
    if (shipmentWeightRecoveryTriggered) {
      const pageContext = params.canonicalDocument.pages.find((page) => page.pageNumber === pageNumber);
      const evidenceTexts = canonicalPageWeightEvidenceTexts(pageContext);
      for (const role of ["grossKg", "netKg"] as const) {
        if ((shipmentWeightRecoveryProjected?.fields[role]?.length ?? 0) > 0) continue;
        const matched = evidenceTexts
          .map((entry) => ({ entry, match: labelledShipmentWeightFallback(entry.text, role) }))
          .find((candidate) => candidate.match);
        if (!matched?.match) continue;
        const declarationWeightField = role === "grossKg" ? "grossWeight" : "netWeight";
        shipmentWeightTextFallback.fields[declarationWeightField] = [{
          candidateId: `${params.segmentId}:text-weight:${pageNumber}:${role}`,
          field: declarationWeightField,
          value: matched.match.value,
          confidence: 0.98,
          extractor: "invoice-labelled-weight-text-fallback-v2",
          evidence: [{
            segmentId: params.segmentId,
            pageNumber,
            text: matched.match.quote,
            contentSource: matched.entry.source
          }]
        }];
        shipmentWeightTextFallbackReturnedFields.push(role);
        shipmentWeightTextFallbackSources.push(matched.entry.source);
      }
    }

    const pageProjected = mergeInvoiceCandidateSources(
      projected,
      ...(numericRecoveryProjected ? [numericRecoveryProjected] : []),
      ...(shipmentWeightRecoveryProjected ? [shipmentWeightRecoveryProjected] : []),
      ...(Object.keys(shipmentWeightTextFallback.fields).length > 0 ? [shipmentWeightTextFallback] : []),
      ...(scalarProjected ? [scalarProjected] : []),
      ...(criticalScalarProjected ? [criticalScalarProjected] : []),
      ...(originProjected ? [originProjected] : [])
    );
    sources.push(pageProjected);
    const pageGoodsCount = response.fields
      .filter((field) => field.field.startsWith("goodsLines[].") && Array.isArray(field.value))
      .reduce((max, field) => Math.max(max, (field.value as unknown[]).length), 0);
    goodsLineOffset += pageGoodsCount;
    const candidateCount = Object.values(pageProjected.fields).reduce((sum, candidates) => sum + candidates.length, 0);
    const recoveryDiagnostic: InvoiceVisionCheckpoint["recoveryDiagnostic"] = {
      focusedRecoveryAttempted, focusedRecoveryUsed, scalarRecoveryRequestedFields,
      scalarRecoveryAttempted, scalarRecoveryDecision, scalarRecoveryReturnedFields, scalarRecoveryError,
      criticalScalarRecoveryRequestedFields, criticalScalarRecoveryAttempted, criticalScalarRecoveryDecision,
      criticalScalarRecoveryReturnedFields, criticalScalarRecoveryError,
      originRecoveryAttempted, originRecoveryDecision, originRecoveryReturned, originRecoveryError,
      goodsNumericRecoveryTriggered, goodsNumericRecoveryReasons, goodsNumericRecoveryAttempted,
      goodsNumericRecoveryDecision, goodsNumericRecoveryReturnedFields, goodsNumericRecoveryError,
      shipmentWeightRecoveryTriggered, shipmentWeightRecoveryReasons, shipmentWeightRecoveryAttempted,
      shipmentWeightRecoveryDecision, shipmentWeightRecoveryReturnedFields, shipmentWeightRecoveryError,
      shipmentWeightTextFallbackReturnedFields, shipmentWeightTextFallbackSources
    };
    checkpoints.push({ pageNumber, decision: response.decision, candidateCount, extractionArtifact: response.extractionArtifact, extractionArtifacts: pageArtifacts, recoveryDiagnostic });
    await params.onPageCheckpoint?.({
      pageNumber,
      status: "COMPLETED",
      decision: response.decision,
      candidateCount,
      candidates: pageProjected,
      extractionArtifact: response.extractionArtifact,
      extractionArtifacts: pageArtifacts,
      recoveryDiagnostic
    });
  }

  return {
    candidates: mergeInvoiceCandidateSources(...sources),
    checkpoints,
    failedPages
  };
}
