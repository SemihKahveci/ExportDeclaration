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
          value: candidate.value,
          confidence: candidate.confidence,
          extractor: candidate.extractor,
          logicalDocumentId: document.logicalDocumentId,
          uploadedFileId: document.uploadedFileId,
          documentType: document.type,
          sourceProcessingRunId: document.sourceProcessingRunId,
          evidence: candidate.evidence
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
