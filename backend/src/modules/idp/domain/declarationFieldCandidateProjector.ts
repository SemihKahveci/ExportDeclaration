import { DocumentType, type DocumentTypeValue } from "../../../common/enums/documentType.js";
import type { DeclarationDocumentSet, DeclarationDocumentRef } from "./declarationDocumentSet.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "./fieldCandidate.types.js";
import type { DeclarationFieldCandidate, DeclarationFieldCandidateEnvelope } from "./declarationFieldCandidate.types.js";

export interface SourceFieldCandidates {
  uploadedFileId: string;
  sourceProcessingRunId: string;
  candidates: FieldCandidateEnvelope;
}

export type DeclarationCandidateProjectionIssueCode =
  | "UNKNOWN_UPLOADED_FILE"
  | "EVIDENCE_OUTSIDE_LOGICAL_DOCUMENT"
  | "AMBIGUOUS_LOGICAL_DOCUMENT";

export class DeclarationCandidateProjectionError extends Error {
  constructor(public readonly code: DeclarationCandidateProjectionIssueCode, message: string) {
    super(message);
    this.name = "DeclarationCandidateProjectionError";
  }
}

function evidencePages(candidate: FieldCandidate): number[] {
  return [...new Set(candidate.evidence.map((item) => item.pageNumber))].sort((a, b) => a - b);
}

function containingDocuments(documents: DeclarationDocumentRef[], candidate: FieldCandidate): DeclarationDocumentRef[] {
  const pages = evidencePages(candidate);
  return documents.filter((document) =>
    pages.length > 0 && pages.every((page) => page >= document.pageStart && page <= document.pageEnd)
  );
}

/**
 * Unit labels are categorical values. Peer extractors frequently preserve the
 * same source unit with different casing (for example ADET vs Adet or KG vs Kg).
 * Canonicalize only the goods-unit field at the declaration-candidate boundary
 * so Foundation 6 can form consensus without granting either extractor implicit
 * authority. Evidence remains untouched and therefore retains the source text.
 */
export function canonicalGoodsUnit(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? compact.toLocaleUpperCase("tr-TR") : value;
}

/**
 * Shipment weights occasionally arrive from peer extractors as display strings
 * (for example `2.320 Kg.`). Declaration packageInfo stores numeric kilograms,
 * so normalize only grossWeight/netWeight when the value explicitly carries a
 * kilogram unit. Turkish invoice formatting is interpreted narrowly: a single
 * dot followed by exactly three digits is a grouping separator, while comma is
 * decimal. Ambiguous unitless strings are deliberately left untouched.
 */
export function canonicalInvoiceCurrency(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const compact = value.trim().toUpperCase();
  if (!compact) return value;
  // `TL` is the common Turkish display abbreviation for ISO 4217 `TRY`.
  // Canonicalize at the declaration-candidate boundary so equivalent model/OCR
  // spellings form consensus while the original evidence remains auditable.
  if (compact === "TL") return "TRY";
  return /^[A-Z]{3}$/.test(compact) ? compact : value;
}

export function canonicalKilogramWeight(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value : value;
  if (typeof value !== "string") return value;

  const match = /^\s*([+-]?[0-9][0-9.,\s]*)\s*(?:kg|kgs|kilogram(?:s)?)\.?\s*$/i.exec(value);
  if (!match) return value;

  let numeric = match[1]!.replace(/\s+/g, "");
  const dots = (numeric.match(/\./g) ?? []).length;
  const commas = (numeric.match(/,/g) ?? []).length;

  if (dots > 0 && commas > 0) {
    // Turkish display form: 2.320,50 kg -> 2320.50
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (commas === 1 && dots === 0) {
    // Turkish decimal form: 2,320 kg -> 2.320
    numeric = numeric.replace(",", ".");
  } else if (dots === 1 && commas === 0 && /^[-+]?\d{1,3}\.\d{3}$/.test(numeric)) {
    // Turkish grouping form seen in invoice weights: 2.320 kg -> 2320
    numeric = numeric.replace(".", "");
  } else if (dots > 1 && commas === 0 && /^[-+]?\d{1,3}(?:\.\d{3})+$/.test(numeric)) {
    numeric = numeric.replace(/\./g, "");
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : value;
}

function canonicalDeclarationCandidateValue(field: string, value: unknown): unknown {
  if (/^goodsLines\.\d+\.unit$/.test(field)) return canonicalGoodsUnit(value);
  if (field === "currency") return canonicalInvoiceCurrency(value);
  if (field === "grossWeight" || field === "netWeight") return canonicalKilogramWeight(value);
  return value;
}

/**
 * Projects file/segment field candidates onto the persisted logical-document boundary.
 * Evidence pages are authoritative for the mapping. We never attach a candidate to
 * the first document of a file and never allow evidence to straddle document ranges.
 */
export function projectDeclarationFieldCandidates(params: {
  documentSet: DeclarationDocumentSet;
  sources: SourceFieldCandidates[];
}): DeclarationFieldCandidateEnvelope {
  const fields: Record<string, DeclarationFieldCandidate[]> = {};

  for (const source of params.sources) {
    const fileDocuments = params.documentSet.documents.filter(
      (document) => document.uploadedFileId === source.uploadedFileId
    );
    if (fileDocuments.length === 0) {
      throw new DeclarationCandidateProjectionError(
        "UNKNOWN_UPLOADED_FILE",
        `Candidate source file ${source.uploadedFileId} is not part of declaration ${params.documentSet.declarationId}.`
      );
    }

    for (const [field, candidates] of Object.entries(source.candidates.fields)) {
      for (const candidate of candidates) {
        const matches = containingDocuments(fileDocuments, candidate);
        if (matches.length === 0) {
          throw new DeclarationCandidateProjectionError(
            "EVIDENCE_OUTSIDE_LOGICAL_DOCUMENT",
            `Candidate ${candidate.candidateId} evidence is not contained by one logical document.`
          );
        }
        if (matches.length > 1) {
          throw new DeclarationCandidateProjectionError(
            "AMBIGUOUS_LOGICAL_DOCUMENT",
            `Candidate ${candidate.candidateId} maps to more than one logical document.`
          );
        }

        const document = matches[0]!;
        if (document.sourceProcessingRunId && document.sourceProcessingRunId !== source.sourceProcessingRunId) {
          throw new DeclarationCandidateProjectionError(
            "EVIDENCE_OUTSIDE_LOGICAL_DOCUMENT",
            `Candidate ${candidate.candidateId} processing-run provenance does not match its logical document.`
          );
        }

        const projected: DeclarationFieldCandidate = {
          candidateId: candidate.candidateId,
          field,
          value: canonicalDeclarationCandidateValue(field, candidate.value),
          confidence: candidate.confidence,
          extractor: candidate.extractor,
          logicalDocumentId: document.logicalDocumentId,
          uploadedFileId: document.uploadedFileId,
          documentType: document.type,
          sourceProcessingRunId: document.sourceProcessingRunId,
          evidence: candidate.evidence,
          ...(candidate.derived ? { derived: true } : {})
        };
        (fields[field] ??= []).push(projected);
      }
    }
  }

  return {
    version: "1",
    companyId: params.documentSet.companyId,
    declarationId: params.documentSet.declarationId,
    fields: stackMultiInvoiceFields(params.documentSet, fields)
  };
}

const INVOICE_DOCUMENT_TYPES = new Set<DocumentTypeValue>([DocumentType.INVOICE, DocumentType.E_INVOICE_XML]);
const GOODS_LINE_FIELD_RE = /^goodsLines\.(\d+)\.(.+)$/;
const ADDITIVE_INVOICE_FIELDS = ["totalAmount", "grossWeight", "netWeight", "totalPackage"] as const;

function invoiceFileIds(documentSet: DeclarationDocumentSet): string[] {
  const ids: string[] = [];
  for (const document of documentSet.documents) {
    if (!INVOICE_DOCUMENT_TYPES.has(document.type) || ids.includes(document.uploadedFileId)) continue;
    ids.push(document.uploadedFileId);
  }
  return ids;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Several invoices on one declaration each number their goods lines from zero.
 * Shift later invoices so the declaration receives one continuous goods list.
 * Per-invoice totals and weights are summed. A packing list stays a peer of
 * that sum, so it can corroborate the shipment without being added twice.
 * Differing currencies leave the money totals untouched for review.
 */
function namespaceCandidateIds(
  documentSet: DeclarationDocumentSet,
  fields: Record<string, DeclarationFieldCandidate[]>
): Record<string, DeclarationFieldCandidate[]> {
  const fileIds = [...new Set(documentSet.documents.map((document) => document.uploadedFileId))];
  if (fileIds.length < 2) return fields;
  const namespaced: Record<string, DeclarationFieldCandidate[]> = {};
  for (const [field, candidates] of Object.entries(fields)) {
    namespaced[field] = candidates.map((candidate) => {
      const prefix = `${candidate.uploadedFileId}:`;
      if (candidate.candidateId.startsWith(prefix)) return candidate;
      return { ...candidate, candidateId: `${prefix}${candidate.candidateId}` };
    });
  }
  return namespaced;
}

export function stackMultiInvoiceFields(
  documentSet: DeclarationDocumentSet,
  fields: Record<string, DeclarationFieldCandidate[]>
): Record<string, DeclarationFieldCandidate[]> {
  const namespaced = namespaceCandidateIds(documentSet, fields);
  const invoices = invoiceFileIds(documentSet);
  const withGoods = invoices.filter((fileId) => Object.keys(namespaced).some((field) =>
    GOODS_LINE_FIELD_RE.test(field) && namespaced[field]?.some((candidate) => candidate.uploadedFileId === fileId)
  ));
  if (withGoods.length < 2) return namespaced;

  const shift = new Map<string, number>();
  let offset = 0;
  for (const fileId of withGoods) {
    shift.set(fileId, offset);
    let maxIndex = 0;
    for (const field of Object.keys(namespaced)) {
      const match = GOODS_LINE_FIELD_RE.exec(field);
      if (!match || !namespaced[field]?.some((candidate) => candidate.uploadedFileId === fileId)) continue;
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
    offset += maxIndex + 1;
  }

  const stacked: Record<string, DeclarationFieldCandidate[]> = {};
  for (const [field, candidates] of Object.entries(namespaced)) {
    const match = GOODS_LINE_FIELD_RE.exec(field);
    for (const candidate of candidates) {
      const fileShift = match ? shift.get(candidate.uploadedFileId) : undefined;
      const nextField = match && fileShift !== undefined
        ? `goodsLines.${Number(match[1]) + fileShift}.${match[2]}`
        : field;
      const next = nextField === field ? candidate : { ...candidate, field: nextField };
      (stacked[nextField] ??= []).push(next);
    }
  }

  for (const field of ADDITIVE_INVOICE_FIELDS) {
    const summed = sumInvoiceField(documentSet, stacked, field, withGoods);
    if (summed) stacked[field] = summed;
  }
  attachInvoiceNumbers(stacked, withGoods);
  return stacked;
}

function labelBoundInvoiceNumbers(candidates: DeclarationFieldCandidate[], fileId: string): DeclarationFieldCandidate[] {
  return candidates.filter((candidate) =>
    candidate.uploadedFileId === fileId &&
    (candidate.candidateId === "header-invoice-no:f6-header-party" || candidate.candidateId.endsWith(":header-invoice-no:f6-header-party"))
  );
}

function attachInvoiceNumbers(
  fields: Record<string, DeclarationFieldCandidate[]>,
  fileIds: string[]
): void {
  for (const fileId of fileIds) {
    const numbers = labelBoundInvoiceNumbers(fields.invoiceNo ?? [], fileId);
    const values = [...new Set(numbers.map((candidate) => typeof candidate.value === "string" ? candidate.value.trim() : ""))];
    if (values.length !== 1 || !values[0]) continue;
    const indexes = new Set<number>();
    for (const [field, candidates] of Object.entries(fields)) {
      const match = GOODS_LINE_FIELD_RE.exec(field);
      if (!match || field.endsWith(".invoiceNo")) continue;
      if (candidates.some((candidate) => candidate.uploadedFileId === fileId)) indexes.add(Number(match[1]));
    }
    const source = numbers[0]!;
    for (const index of indexes) {
      const field = `goodsLines.${index}.invoiceNo`;
      if (fields[field]?.length) continue;
      fields[field] = [{
        ...source,
        candidateId: `multi-invoice-line-no:${fileId}:${index}`,
        field,
        value: values[0],
        derived: true
      }];
    }
  }
}

function sameCurrency(fields: Record<string, DeclarationFieldCandidate[]>, fileIds: string[]): boolean {
  const currencies = fileIds.map((fileId) => {
    const values = (fields.currency ?? [])
      .filter((candidate) => candidate.uploadedFileId === fileId)
      .map((candidate) => candidate.value);
    const unique = [...new Set(values.map((value) => typeof value === "string" ? value.trim().toUpperCase() : ""))];
    return unique.length === 1 ? unique[0] : undefined;
  });
  return currencies.every((currency) => currency && currency === currencies[0]);
}

function sumInvoiceField(
  documentSet: DeclarationDocumentSet,
  fields: Record<string, DeclarationFieldCandidate[]>,
  field: string,
  fileIds: string[]
): DeclarationFieldCandidate[] | undefined {
  if (field === "totalAmount" && !sameCurrency(fields, fileIds)) return undefined;
  const perFile: DeclarationFieldCandidate[][] = [];
  for (const fileId of fileIds) {
    const ownAll = (fields[field] ?? []).filter((candidate) => candidate.uploadedFileId === fileId);
    const labelled = field === "totalAmount"
      ? ownAll.filter((candidate) => candidate.candidateId === "header-total-amount:f6-totalAmount" || candidate.candidateId.endsWith(":header-total-amount:f6-totalAmount"))
      : [];
    const own = labelled.length > 0 ? labelled : ownAll;
    const numbers = own.map((candidate) => finiteNumber(candidate.value));
    if (own.length === 0 || numbers.some((value) => value === undefined)) return undefined;
    const first = numbers[0]!;
    if (numbers.some((value) => Math.abs(value! - first) > 1e-6)) return undefined;
    perFile.push(own);
  }
  const head = perFile[0]?.[0];
  const anchor = documentSet.documents.find((document) => document.uploadedFileId === head?.uploadedFileId);
  if (!head || !anchor) return undefined;
  const others = (fields[field] ?? []).filter((candidate) => !fileIds.includes(candidate.uploadedFileId));
  const sources = perFile.flat();
  const value = Math.round(perFile.reduce((total, group) => total + finiteNumber(group[0]!.value)!, 0) * 1e6) / 1e6;
  return [...others, {
    candidateId: `multi-invoice-sum:${field}`,
    field,
    value,
    confidence: Math.min(...sources.map((candidate) => candidate.confidence)),
    extractor: "declaration-multi-invoice-sum-v1",
    logicalDocumentId: anchor.logicalDocumentId,
    uploadedFileId: anchor.uploadedFileId,
    documentType: anchor.type,
    evidence: sources.flatMap((candidate) => candidate.evidence),
    derived: true
  }];
}
