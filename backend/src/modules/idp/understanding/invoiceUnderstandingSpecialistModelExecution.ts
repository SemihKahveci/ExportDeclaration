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

export const FOUNDATION8_SPECIALIST_MODEL_EXECUTION_VERSION = "8.15.0" as const;

const REQUESTED_FIELDS: Record<InvoiceSpecialistDomain, readonly string[]> = {
  PARTIES: [
    "parties.seller.name", "parties.seller.address", "parties.seller.country",
    "parties.buyer.name", "parties.buyer.address", "parties.buyer.country"
  ],
  COMMERCIAL: ["invoiceNo", "invoiceDate", "currency", "totalAmount", "exchangeRate", "paymentTerm", "bankDetails"],
  GOODS: ["goodsLines.*.productCode", "goodsLines.*.description", "goodsLines.*.hsCode", "goodsLines.*.quantity", "goodsLines.*.unit", "goodsLines.*.unitPrice", "goodsLines.*.lineTotal", "goodsLines.*.origin"],
  LOGISTICS: ["deliveryTerm", "transportMode", "grossWeight", "netWeight", "totalPackage", "packageType"]
};

function fieldOwnedBy(domain: InvoiceSpecialistDomain, field: string): boolean {
  if (domain === "PARTIES") return /^parties\.(seller|buyer)\.(name|address|country)$/.test(field);
  if (domain === "COMMERCIAL") return /^(invoiceNo|invoiceDate|currency|totalAmount|exchangeRate|paymentTerm|bankDetails)$/.test(field);
  if (domain === "GOODS") return /^goodsLines\.\d+\.(productCode|description|hsCode|quantity|unit|unitPrice|lineTotal|origin)$/.test(field);
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
}

export interface Foundation8SpecialistModelExecutionAudit {
  version: typeof FOUNDATION8_SPECIALIST_MODEL_EXECUTION_VERSION;
  mode: "SHADOW_ONLY";
  productionCandidateMutation: false;
  modelCallsAttempted: number;
  totalElapsedMs: number;
  specialists: Foundation8SpecialistModelAuditItem[];
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

  for (const request of requests) {
    const requestedFields = REQUESTED_FIELDS[request.domain];
    const specialistStartedAt = Date.now();
    try {
      const response = await params.provider.extractInvoice({
        version: "1",
        documentId: request.documentId,
        evidenceMode: InvoiceLlmEvidenceMode.TEXT,
        requestedFields: [...requestedFields],
        nativeText: renderFoundation8PageGroundedEvidencePacket(request),
        verifiedKnowledge: [{
          label: `foundation8-skill:${request.skillName}@${request.skillVersion}`,
          content: request.skillContext
        }],
        focusInstruction: [
          `You are the ${request.domain} invoice specialist.`,
          `You may return only these owned semantic sections: ${request.owns.join(", ")}.`,
          `Never infer or repair forbidden sections: ${request.forbidden.join(", ")}.`,
          "Use only source-grounded evidence. Missing or ambiguous values must remain absent/review-required.",
          "Canonical evidence is page-delimited. Every returned evidence.pageNumber must match the page containing the cited value; never move evidence across page boundaries.",
          request.skillContext
        ].join("\n\n")
      });
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
    modelCallsAttempted: requests.length,
    totalElapsedMs: Date.now() - executionStartedAt,
    specialists
  };
}
