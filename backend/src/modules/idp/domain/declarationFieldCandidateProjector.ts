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
    fields
  };
}
