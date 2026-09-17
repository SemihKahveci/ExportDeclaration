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
