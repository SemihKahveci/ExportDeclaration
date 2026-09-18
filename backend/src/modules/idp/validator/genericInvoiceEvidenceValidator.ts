import type { CanonicalBBox, CanonicalDocument } from "../domain/canonicalDocument.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import {
  GenericEvidenceValidationStatus,
  type GenericEvidenceReasonCode,
  type GenericEvidenceValidationIssue,
  type GenericEvidenceValidationResult
} from "../domain/genericEvidenceValidation.types.js";

const REQUIRED_FIELDS = ["hsCode", "quantity", "unitPrice", "lineTotal"] as const;
const ROW_FIELD_RE = /^goodsLines\.(\d+)\.([A-Za-z0-9_]+)$/;

function bboxValid(bbox: CanonicalBBox | undefined): boolean {
  return Boolean(bbox && [bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite) && bbox!.x0 >= 0 && bbox!.y0 >= 0 && bbox!.x1 <= 1 && bbox!.y1 <= 1 && bbox!.x0 <= bbox!.x1 && bbox!.y0 <= bbox!.y1);
}

function intersects(a: CanonicalBBox, b: CanonicalBBox): boolean {
  const slack = 0.002;
  return a.x0 <= b.x1 + slack && a.x1 + slack >= b.x0 && a.y0 <= b.y1 + slack && a.y1 + slack >= b.y0;
}

function normalized(value: string): string {
  return value.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/\s+/g, "").replace(/,/g, ".");
}

function evidenceTokens(value: string): string[] {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .trim()
    .split(/\s+/)
    .map(token => token.replace(/,/g, "."))
    .filter(Boolean);
}

function isOrderedSubsequence(expected: string[], actual: string[]): boolean {
  if (!expected.length) return true;
  let expectedIndex = 0;
  for (const token of actual) {
    if (token === expected[expectedIndex]) expectedIndex += 1;
    if (expectedIndex === expected.length) return true;
  }
  return false;
}

function evidenceSupported(candidate: FieldCandidate, canonical: CanonicalDocument): boolean {
  return candidate.evidence.every(evidence => {
    const page = canonical.pages.find(item => item.pageNumber === evidence.pageNumber);
    if (!page || !bboxValid(evidence.bbox)) return false;
    const overlapping = page.words.filter(word => intersects(word.bbox, evidence.bbox!));
    if (!overlapping.length) return false;
    const expectedSource = evidence.contentSource === "OCR" ? "OCR" : evidence.contentSource === "NATIVE_TEXT" ? "NATIVE_TEXT" : undefined;
    if (expectedSource && !overlapping.some(word => word.source === expectedSource)) return false;
    if (!evidence.text?.trim()) return true;
    const orderedOverlapping = overlapping.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    const evidenceText = normalized(evidence.text);
    const canonicalText = normalized(orderedOverlapping.map(word => word.text).join(" "));
    if (canonicalText.includes(evidenceText) || evidenceText.includes(canonicalText)) return true;

    // A multi-word candidate stores one union bbox. Other invoice columns can sit
    // geometrically inside that union even though they were never part of the
    // candidate. Validate the selected evidence text as an ordered subsequence of
    // canonical tokens so those intervening words do not create false negatives.
    // We deliberately keep exact token equality: invented/rewritten text still fails.
    return isOrderedSubsequence(evidenceTokens(evidence.text), orderedOverlapping.flatMap(word => evidenceTokens(word.text)));
  });
}

function derivedProductCodeTraceable(candidate: FieldCandidate): boolean {
  if (!candidate.derived) return true;
  if (typeof candidate.value !== "string") return false;
  const value = normalized(candidate.value);
  return candidate.evidence.some(evidence => {
    if (!evidence.text) return false;
    const source = normalized(evidence.text);
    return source.endsWith(value) && source !== value;
  });
}

function numericCandidate(fields: Record<string, FieldCandidate[]>, rowIndex: number, name: string): number | undefined {
  const value = fields[`goodsLines.${rowIndex}.${name}`]?.[0]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pushIssue(issues: GenericEvidenceValidationIssue[], rowIndex: number, code: GenericEvidenceReasonCode, message: string, field?: string) {
  issues.push({ rowIndex, field, code, message });
}

export function validateGenericInvoiceEvidence(canonical: CanonicalDocument, envelope: FieldCandidateEnvelope): GenericEvidenceValidationResult {
  const rowIndexes = [...new Set(Object.keys(envelope.fields).map(field => ROW_FIELD_RE.exec(field)).filter(Boolean).map(match => Number(match![1])))].sort((a, b) => a - b);
  const rows = rowIndexes.map(rowIndex => {
    const issues: GenericEvidenceValidationIssue[] = [];
    for (const name of REQUIRED_FIELDS) {
      const field = `goodsLines.${rowIndex}.${name}`;
      if (!envelope.fields[field]?.length) pushIssue(issues, rowIndex, "MISSING_REQUIRED_FIELD", `Required field ${field} has no candidate.`, field);
    }

    for (const [field, candidates] of Object.entries(envelope.fields)) {
      const match = ROW_FIELD_RE.exec(field);
      if (!match || Number(match[1]) !== rowIndex) continue;
      for (const candidate of candidates) {
        if (!candidate.evidence?.length) {
          pushIssue(issues, rowIndex, "MISSING_EVIDENCE", `Candidate ${candidate.candidateId} has no evidence.`, field);
          continue;
        }
        for (const evidence of candidate.evidence) {
          if (!canonical.pages.some(page => page.pageNumber === evidence.pageNumber)) pushIssue(issues, rowIndex, "INVALID_EVIDENCE_PAGE", `Candidate ${candidate.candidateId} references page ${evidence.pageNumber}, which is absent from canonical document.`, field);
          else if (!bboxValid(evidence.bbox)) pushIssue(issues, rowIndex, "INVALID_EVIDENCE_BBOX", `Candidate ${candidate.candidateId} has invalid normalized evidence bbox.`, field);
        }
        if (!evidenceSupported(candidate, canonical)) pushIssue(issues, rowIndex, "EVIDENCE_NOT_SUPPORTED_BY_CANONICAL", `Candidate ${candidate.candidateId} evidence is not supported by canonical words.`, field);
        if (field.endsWith(".productCode") && !derivedProductCodeTraceable(candidate)) pushIssue(issues, rowIndex, "DERIVED_PRODUCT_CODE_NOT_TRACEABLE", `Derived product code ${String(candidate.value)} is not a suffix of its canonical source token.`, field);
      }
    }

    const q = numericCandidate(envelope.fields, rowIndex, "quantity");
    const p = numericCandidate(envelope.fields, rowIndex, "unitPrice");
    const a = numericCandidate(envelope.fields, rowIndex, "lineTotal");
    if (q !== undefined && p !== undefined && a !== undefined) {
      const tolerance = Math.max(0.05, Math.abs(a) * 0.001);
      if (Math.abs(q * p - a) > tolerance) pushIssue(issues, rowIndex, "ARITHMETIC_MISMATCH", `quantity × unitPrice does not reconcile with lineTotal within tolerance.`);
    }

    return { rowIndex, status: issues.length ? GenericEvidenceValidationStatus.REVIEW_REQUIRED : GenericEvidenceValidationStatus.VALID, issues };
  });

  const allIssues = rows.flatMap(row => row.issues);
  const reasonCounts: GenericEvidenceValidationResult["summary"]["reasonCounts"] = {};
  for (const issue of allIssues) reasonCounts[issue.code] = (reasonCounts[issue.code] ?? 0) + 1;
  const reviewRequiredRowCount = rows.filter(row => row.status === GenericEvidenceValidationStatus.REVIEW_REQUIRED).length;
  return {
    version: "1",
    status: reviewRequiredRowCount ? GenericEvidenceValidationStatus.REVIEW_REQUIRED : GenericEvidenceValidationStatus.VALID,
    rows,
    summary: { rowCount: rows.length, validRowCount: rows.length - reviewRequiredRowCount, reviewRequiredRowCount, issueCount: allIssues.length, reasonCounts }
  };
}
