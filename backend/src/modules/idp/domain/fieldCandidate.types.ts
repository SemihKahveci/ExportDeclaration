import type { CanonicalBBox } from "./canonicalDocument.types.js";

export type FieldCandidateContentSource = "NATIVE_TEXT" | "OCR" | "DERIVED";

export interface FieldCandidateEvidence {
  segmentId: string;
  pageNumber: number;
  bbox?: CanonicalBBox;
  text?: string;
  contentSource: FieldCandidateContentSource;
}

export interface FieldCandidate<T = unknown> {
  candidateId: string;
  field: string;
  value: T;
  confidence: number;
  extractor: string;
  evidence: FieldCandidateEvidence[];
  derived?: boolean;
}

export interface FieldCandidateEnvelope {
  version: "1";
  fields: Record<string, FieldCandidate[]>;
}

export const FieldResolutionStatus = {
  RESOLVED: "RESOLVED",
  AMBIGUOUS: "AMBIGUOUS"
} as const;

export const FieldResolutionMethod = {
  SINGLE_VALUE: "SINGLE_VALUE",
  CONSENSUS: "CONSENSUS",
  AMBIGUOUS: "AMBIGUOUS"
} as const;

export interface ResolvedFieldCandidate {
  field: string;
  status: "RESOLVED" | "AMBIGUOUS";
  method: "SINGLE_VALUE" | "CONSENSUS" | "AMBIGUOUS";
  candidateIds: string[];
  selectedCandidateId?: string;
  value?: unknown;
}

export interface FieldResolutionEnvelope {
  version: "1";
  status: "RESOLVED" | "AMBIGUOUS";
  fields: Record<string, ResolvedFieldCandidate>;
  summary: {
    fieldCount: number;
    resolvedCount: number;
    ambiguousCount: number;
  };
}
