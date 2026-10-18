import type {
  InvoiceLlmExtractionProvider,
  InvoiceLlmExtractionResponse
} from "../domain/invoiceLlmExtraction.types.js";
import { InvoiceLlmEvidenceMode } from "../domain/invoiceLlmExtraction.types.js";
import {
  planInvoiceUnderstandingSpecialists,
  type InvoiceSpecialistDomain,
  type InvoiceUnderstandingEvidenceBundle
} from "./invoiceUnderstandingOrchestration.js";
import { mergeFoundation8GoodsChunks, planFoundation8GoodsChunks } from "./invoiceUnderstandingGoodsChunking.js";

export const FOUNDATION8_SPECIALIST_MODEL_EXECUTION_VERSION = "8.22.0" as const;

const REQUESTED_FIELDS: Record<InvoiceSpecialistDomain, readonly string[]> = {
  PARTIES: [
    "parties.seller.name", "parties.seller.address", "parties.seller.country",
    "parties.buyer.name", "parties.buyer.address", "parties.buyer.country"
  ],
  COMMERCIAL: ["invoiceNo", "invoiceDate", "currency", "totalAmount", "exchangeRate", "paymentTerm", "bankDetails"],
  GOODS: ["goodsTable.expectedRowCount", "goodsLines.*.productCode", "goodsLines.*.description", "goodsLines.*.hsCode", "goodsLines.*.quantity", "goodsLines.*.unit", "goodsLines.*.unitPrice", "goodsLines.*.lineTotal", "goodsLines.*.origin"],
  LOGISTICS: ["deliveryTerm", "transportMode", "grossWeight", "netWeight", "totalPackage", "packageType"]
};

function fieldOwnedBy(domain: InvoiceSpecialistDomain, field: string): boolean {
  if (domain === "PARTIES") return /^parties\.(seller|buyer)\.(name|address|country)$/.test(field);
  if (domain === "COMMERCIAL") return /^(invoiceNo|invoiceDate|currency|totalAmount|exchangeRate|paymentTerm|bankDetails)$/.test(field);
  if (domain === "GOODS") return field === "goodsTable.expectedRowCount" || /^goodsLines\.\d+\.(productCode|description|hsCode|quantity|unit|unitPrice|lineTotal|origin)$/.test(field);
  return /^(deliveryTerm|transportMode|grossWeight|netWeight|totalPackage|packageType)$/.test(field);
}


export function renderFoundation8PageGroundedEvidencePacket(request: {
  canonicalPages?: readonly { pageNumber: number; source: "NATIVE_TEXT" | "OCR"; text: string }[];
  canonicalText?: string;
}): string | undefined {
  const pages = [...(request.canonicalPages ?? [])]
    .filter(page => Number.isInteger(page.pageNumber) && page.pageNumber > 0 && page.text.trim())
    .sort((a, b) => a.pageNumber - b.pageNumber);
  if (!pages.length) return request.canonicalText?.trim() || undefined;
  return pages.map(page => [
    `<<<PAGE ${page.pageNumber} | SOURCE ${page.source}>>>`,
    page.text.trim(),
    `<<<END PAGE ${page.pageNumber}>>>`
  ].join("\n")).join("\n\n");
}

function goodsRowIndexes(response: InvoiceLlmExtractionResponse): Set<number> {
  return new Set(response.fields.flatMap(field => {
    const match = /^goodsLines\.(\d+)\./.exec(field.field);
    return match ? [Number(match[1])] : [];
  }));
}

function expectedGoodsRowCount(response: InvoiceLlmExtractionResponse): number | undefined {
  const value = response.fields.find(field => field.field === "goodsTable.expectedRowCount")?.value;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function mergeGoodsRecovery(primary: InvoiceLlmExtractionResponse, recovery: InvoiceLlmExtractionResponse): InvoiceLlmExtractionResponse {
  const byField = new Map(primary.fields.map(field => [field.field, field]));
  for (const field of recovery.fields) byField.set(field.field, field);
  return {
    ...recovery,
    decision: recovery.decision === "REVIEW_REQUIRED" ? primary.decision : recovery.decision,
    fields: [...byField.values()],
    issues: [...primary.issues, ...recovery.issues]
  };
}

export interface Foundation8SpecialistModelAuditItem {
  domain: InvoiceSpecialistDomain;
  skillName: string;
  skillVersion: string;
  requestedFields: readonly string[];
  status: "COMPLETED" | "FAILED";
  decision?: string;
  returnedFieldCount: number;
  acceptedOwnedFieldCount: number;
  rejectedOutOfDomainFields: string[];
  response?: InvoiceLlmExtractionResponse;
  error?: string;
  elapsedMs?: number;
  goodsChunkAudit?: { plannedChunks: number; completedChunks: number; failedTargetPages: number[]; retriedTargetPages: number[]; materializedRowCount: number; expectedRowCount?: number };
}

export interface Foundation8SpecialistModelExecutionAudit {
  version: typeof FOUNDATION8_SPECIALIST_MODEL_EXECUTION_VERSION;
  mode: "SHADOW_ONLY";
  productionCandidateMutation: false;
  modelCallsAttempted: number;
  totalElapsedMs: number;
  specialists: Foundation8SpecialistModelAuditItem[];
}


async function executeGoodsChunked(params: {
  request: ReturnType<typeof planInvoiceUnderstandingSpecialists>[number];
  provider: InvoiceLlmExtractionProvider;
  requestedFields: readonly string[];
  onModelCall: () => void;
}): Promise<{ response: InvoiceLlmExtractionResponse; audit: NonNullable<Foundation8SpecialistModelAuditItem["goodsChunkAudit"]> }> {
  const chunks = planFoundation8GoodsChunks(params.request.canonicalPages ?? []);
  if (!chunks.length) {
    params.onModelCall();
    const response = await params.provider.extractInvoice({
      version: "1", documentId: params.request.documentId, evidenceMode: InvoiceLlmEvidenceMode.TEXT,
      requestedFields: [...params.requestedFields], nativeText: renderFoundation8PageGroundedEvidencePacket(params.request),
      verifiedKnowledge: [{ label: `foundation8-skill:${params.request.skillName}@${params.request.skillVersion}`, content: params.request.skillContext }],
      focusInstruction: `You are the GOODS invoice specialist. Extract source-grounded commercial rows only. ${params.request.skillContext}`
    });
    return { response, audit: { plannedChunks: 0, completedChunks: 0, failedTargetPages: [], retriedTargetPages: [], materializedRowCount: goodsRowIndexes(response).size, ...(expectedGoodsRowCount(response) !== undefined ? { expectedRowCount: expectedGoodsRowCount(response) } : {}) } };
  }

  const completed: Array<{ targetPageNumber: number; response: InvoiceLlmExtractionResponse }> = [];
  const failedTargetPages: number[] = [];
  const retriedTargetPages: number[] = [];
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= chunks.length) return;
      const chunk = chunks[index]!;
      const packet = renderFoundation8PageGroundedEvidencePacket({ canonicalPages: chunk.pages });
      const call = async (recovery: boolean) => {
        params.onModelCall();
        return params.provider.extractInvoice({
          version: "1",
          documentId: `${params.request.documentId}:${chunk.chunkId}${recovery ? ":recovery" : ""}`,
          evidenceMode: InvoiceLlmEvidenceMode.TEXT,
          requestedFields: [...params.requestedFields],
          nativeText: packet,
          verifiedKnowledge: [{ label: `foundation8-skill:${params.request.skillName}@${params.request.skillVersion}`, content: params.request.skillContext }],
          focusInstruction: [
            `You are the GOODS invoice specialist for bounded chunk ${chunk.chunkId}.`,
            `TARGET PAGE is ${chunk.targetPageNumber}. The packet may include the following page only as continuation context.`,
            `Emit ONLY commercial rows whose row begins on TARGET PAGE ${chunk.targetPageNumber}. A row may continue onto the adjacent context page; keep it atomic and cite each field on its actual page.`,
            "goodsLines indexes are LOCAL to this chunk: 0,1,2... in source order. The pipeline assigns global row identity after chunk merge.",
            "goodsTable.expectedRowCount, when source-supported, means the number of commercial rows that BEGIN on this TARGET PAGE only.",
            "Bind quantity/unit/unitPrice/lineTotal by column semantics. Package/carton/pallet counts are never commercial quantity.",
            "Do not fabricate 12-digit GTIP from shorter HS/HSN codes. Do not infer origin from seller/buyer country.",
            "Every emitted field needs page-local source evidence. Never copy a field from a neighboring commercial row.",
            recovery ? "This is the one bounded recovery for this chunk. Re-read only this chunk and return the most complete source-grounded rows possible." : "",
            params.request.skillContext
          ].filter(Boolean).join("\n\n")
        });
      };
      try {
        let response = await call(false);
        if (response.decision === "REVIEW_REQUIRED") {
          retriedTargetPages.push(chunk.targetPageNumber);
          response = mergeGoodsRecovery(response, await call(true));
        }
        completed.push({ targetPageNumber: chunk.targetPageNumber, response });
      } catch {
        // One bounded retry is chunk-local. A failed page cannot fail unrelated pages.
        try {
          retriedTargetPages.push(chunk.targetPageNumber);
          completed.push({ targetPageNumber: chunk.targetPageNumber, response: await call(true) });
        } catch {
          failedTargetPages.push(chunk.targetPageNumber);
        }
      }
    }
  };
  // Two bounded workers prevent a long multi-page table from becoming one giant
  // sequential request while avoiding an uncontrolled model-call swarm.
  await Promise.all([worker(), worker()]);
  const merged = mergeFoundation8GoodsChunks({ documentId: params.request.documentId, chunks: completed, failedTargetPages });
  return {
    response: merged.response,
    audit: {
      plannedChunks: chunks.length,
      completedChunks: completed.length,
      failedTargetPages: [...failedTargetPages].sort((a, b) => a - b),
      retriedTargetPages: [...new Set(retriedTargetPages)].sort((a, b) => a - b),
      materializedRowCount: merged.materializedRowCount,
      ...(merged.expectedRowCount !== undefined ? { expectedRowCount: merged.expectedRowCount } : {})
    }
  };
}

/**
 * Executes bounded Foundation 8 specialists against the same canonical evidence.
 * Results are audit-only in 8.10: they cannot mutate production candidates or normalizedData.
 * A failed specialist is isolated so shadow experimentation cannot fail the production invoice job.
 */
export async function executeFoundation8SpecialistModelShadow(params: {
  bundle: InvoiceUnderstandingEvidenceBundle;
  provider: InvoiceLlmExtractionProvider;
}): Promise<Foundation8SpecialistModelExecutionAudit> {
  const requests = planInvoiceUnderstandingSpecialists(params.bundle);
  const executionStartedAt = Date.now();
  const specialists: Foundation8SpecialistModelAuditItem[] = [];
  let modelCallsAttempted = 0;

  for (const request of requests) {
    const requestedFields = REQUESTED_FIELDS[request.domain];
    const specialistStartedAt = Date.now();
    try {
      let goodsChunkAudit: Foundation8SpecialistModelAuditItem["goodsChunkAudit"];
      let response: InvoiceLlmExtractionResponse;
      if (request.domain === "GOODS" && (request.canonicalPages?.length ?? 0) > 0) {
        const chunked = await executeGoodsChunked({
          request, provider: params.provider, requestedFields,
          onModelCall: () => { modelCallsAttempted += 1; }
        });
        response = chunked.response;
        goodsChunkAudit = chunked.audit;
      } else {
        modelCallsAttempted += 1;
        response = await params.provider.extractInvoice({
          version: "1",
          documentId: request.documentId,
          evidenceMode: InvoiceLlmEvidenceMode.TEXT,
          requestedFields: [...requestedFields],
          nativeText: renderFoundation8PageGroundedEvidencePacket(request),
          verifiedKnowledge: [{ label: `foundation8-skill:${request.skillName}@${request.skillVersion}`, content: request.skillContext }],
          focusInstruction: [
            `You are the ${request.domain} invoice specialist.`,
            `You may return only these owned semantic sections: ${request.owns.join(", ")}.`,
            `Never infer or repair forbidden sections: ${request.forbidden.join(", ")}.`,
            "Use only source-grounded evidence. Missing or ambiguous values must remain absent/review-required.",
            "Canonical evidence is page-delimited. Every returned evidence.pageNumber must match the page containing the cited value; never move evidence across page boundaries.",
            "Evidence quotes must be verbatim source spans from the cited page and should include enough neighboring role/row context to prove the semantic binding.",
            request.skillContext
          ].join("\n\n")
        });
      }
      const rejected = response.fields.filter(field => !fieldOwnedBy(request.domain, field.field)).map(field => field.field);
      specialists.push({
        domain: request.domain,
        skillName: request.skillName,
        skillVersion: request.skillVersion,
        requestedFields,
        status: "COMPLETED",
        decision: response.decision,
        returnedFieldCount: response.fields.length,
        acceptedOwnedFieldCount: response.fields.length - rejected.length,
        rejectedOutOfDomainFields: rejected,
        elapsedMs: Date.now() - specialistStartedAt,
        ...(goodsChunkAudit ? { goodsChunkAudit } : {}),
        response: {
          ...response,
          fields: response.fields.filter(field => fieldOwnedBy(request.domain, field.field))
        }
      });
    } catch (error) {
      specialists.push({
        domain: request.domain,
        skillName: request.skillName,
        skillVersion: request.skillVersion,
        requestedFields,
        status: "FAILED",
        returnedFieldCount: 0,
        acceptedOwnedFieldCount: 0,
        rejectedOutOfDomainFields: [],
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - specialistStartedAt
      });
    }
  }

  return {
    version: FOUNDATION8_SPECIALIST_MODEL_EXECUTION_VERSION,
    mode: "SHADOW_ONLY",
    productionCandidateMutation: false,
    modelCallsAttempted,
    totalElapsedMs: Date.now() - executionStartedAt,
    specialists
  };
}
