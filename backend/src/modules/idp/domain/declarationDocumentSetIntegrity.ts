import type { DeclarationDocumentRef, DeclarationDocumentSet } from "./declarationDocumentSet.types.js";

export interface DeclarationDocumentSetIntegrityIssue {
  code: "INVALID_PAGE_RANGE" | "OVERLAPPING_LOGICAL_DOCUMENTS" | "DUPLICATE_LOGICAL_DOCUMENT";
  logicalDocumentIds: string[];
  uploadedFileId: string;
  message: string;
}

export interface DeclarationDocumentSetIntegrityResult {
  valid: boolean;
  issues: DeclarationDocumentSetIntegrityIssue[];
}

function byPhysicalFile(documents: DeclarationDocumentRef[]): Map<string, DeclarationDocumentRef[]> {
  const result = new Map<string, DeclarationDocumentRef[]>();
  for (const document of documents) {
    const group = result.get(document.uploadedFileId) ?? [];
    group.push(document);
    result.set(document.uploadedFileId, group);
  }
  return result;
}

export function validateDeclarationDocumentSetIntegrity(set: DeclarationDocumentSet): DeclarationDocumentSetIntegrityResult {
  const issues: DeclarationDocumentSetIntegrityIssue[] = [];
  const seenLogicalIds = new Set<string>();

  for (const document of set.documents) {
    if (seenLogicalIds.has(document.logicalDocumentId)) {
      issues.push({
        code: "DUPLICATE_LOGICAL_DOCUMENT",
        logicalDocumentIds: [document.logicalDocumentId],
        uploadedFileId: document.uploadedFileId,
        message: `Logical document ${document.logicalDocumentId} document set içinde birden fazla kez yer alıyor.`
      });
    }
    seenLogicalIds.add(document.logicalDocumentId);

    if (document.pageStart < 1 || document.pageEnd < document.pageStart) {
      issues.push({
        code: "INVALID_PAGE_RANGE",
        logicalDocumentIds: [document.logicalDocumentId],
        uploadedFileId: document.uploadedFileId,
        message: `Geçersiz logical-document page range: ${document.pageStart}-${document.pageEnd}.`
      });
    }
  }

  for (const [uploadedFileId, documents] of byPhysicalFile(set.documents)) {
    const ordered = documents.slice().sort((a, b) => a.pageStart - b.pageStart || a.pageEnd - b.pageEnd || a.logicalDocumentId.localeCompare(b.logicalDocumentId));
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1]!;
      const current = ordered[i]!;
      if (current.pageStart <= previous.pageEnd) {
        issues.push({
          code: "OVERLAPPING_LOGICAL_DOCUMENTS",
          logicalDocumentIds: [previous.logicalDocumentId, current.logicalDocumentId],
          uploadedFileId,
          message: `Aynı fiziksel dosyadaki logical document aralıkları çakışıyor: ${previous.pageStart}-${previous.pageEnd} ve ${current.pageStart}-${current.pageEnd}.`
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
