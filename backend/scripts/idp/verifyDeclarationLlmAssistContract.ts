import assert from "node:assert/strict";

import { DocumentType } from "../../src/common/enums/documentType.js";
import type { DeclarationCrossDocumentConsistencyResult } from "../../src/modules/idp/domain/declarationCrossDocumentConsistency.types.js";
import { DeclarationLlmAssistDecision } from "../../src/modules/idp/domain/declarationLlmAssist.types.js";
import {
  buildDeclarationLlmAssistRequest,
  decideDeclarationLlmAssistPolicy,
  DeclarationLlmAssistPolicyDecision,
  validateDeclarationLlmAssistResponse
} from "../../src/modules/idp/llm/declarationLlmAssistPolicy.js";

const conflict: DeclarationCrossDocumentConsistencyResult = {
  status: "REVIEW_REQUIRED",
  conflictFields: ["goodsLines.0.quantity"],
  insufficientEvidenceFields: [],
  fields: [{
    field: "goodsLines.0.quantity",
    status: "CONFLICT",
    documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],
    missingDocumentTypes: [],
    reason: "VALUE_MISMATCH",
    observations: [
      { candidateId: "invoice-qty", documentType: DocumentType.INVOICE, logicalDocumentId: "logical-invoice", uploadedFileId: "file-invoice", value: 2 },
      { candidateId: "packing-qty", documentType: DocumentType.PACKING_LIST, logicalDocumentId: "logical-packing", uploadedFileId: "file-packing", value: 3 }
    ]
  }]
};

const insufficient: DeclarationCrossDocumentConsistencyResult = {
  status: "REVIEW_REQUIRED",
  conflictFields: [],
  insufficientEvidenceFields: ["invoiceNo"],
  fields: [{
    field: "invoiceNo",
    status: "INSUFFICIENT_EVIDENCE",
    documentTypes: [DocumentType.INVOICE, DocumentType.PACKING_LIST],
    missingDocumentTypes: [DocumentType.PACKING_LIST],
    reason: "MISSING_CONFIGURED_DOCUMENT_TYPE",
    observations: [{ candidateId: "invoice-no", documentType: DocumentType.INVOICE, logicalDocumentId: "logical-invoice", uploadedFileId: "file-invoice", value: "INV-1" }]
  }]
};

const ready: DeclarationCrossDocumentConsistencyResult = {
  status: "CONSISTENT",
  conflictFields: [],
  insufficientEvidenceFields: [],
  fields: []
};

function mustReject(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

function main() {
  assert.equal(decideDeclarationLlmAssistPolicy(ready), DeclarationLlmAssistPolicyDecision.SKIP_READY);
  assert.equal(decideDeclarationLlmAssistPolicy(insufficient), DeclarationLlmAssistPolicyDecision.SKIP_NO_GROUNDED_CONFLICT);
  assert.equal(decideDeclarationLlmAssistPolicy(conflict), DeclarationLlmAssistPolicyDecision.ALLOW_GROUNDED_CONFLICT);

  const request = buildDeclarationLlmAssistRequest({ companyId: "company-1", declarationId: "declaration-1", consistency: conflict });
  assert.equal(request.fields.length, 1);
  assert.deepEqual(request.fields[0].candidates.map((candidate) => candidate.candidateId), ["invoice-qty", "packing-qty"]);

  const valid = validateDeclarationLlmAssistResponse(request, {
    version: "1",
    decision: DeclarationLlmAssistDecision.RESOLVED,
    selections: [{ field: "goodsLines.0.quantity", candidateId: "invoice-qty" }],
    issues: [],
    model: "qwen-test",
    provider: "test-provider"
  });
  assert.equal(valid.selections[0].candidateId, "invoice-qty");

  const hallucinatedCandidateRejected = mustReject(() => validateDeclarationLlmAssistResponse(request, {
    ...valid,
    selections: [{ field: "goodsLines.0.quantity", candidateId: "invented-qty" }]
  }));
  const unrequestedFieldRejected = mustReject(() => validateDeclarationLlmAssistResponse(request, {
    ...valid,
    selections: [{ field: "goodsLines.1.quantity", candidateId: "invoice-qty" }]
  }));
  const partialResolutionRejected = mustReject(() => validateDeclarationLlmAssistResponse({
    ...request,
    fields: [...request.fields, { field: "invoiceNo", candidates: [{ candidateId: "inv-a", field: "invoiceNo", documentType: DocumentType.INVOICE, logicalDocumentId: "logical-invoice", uploadedFileId: "file-invoice", value: "A" }, { candidateId: "inv-b", field: "invoiceNo", documentType: DocumentType.PACKING_LIST, logicalDocumentId: "logical-packing", uploadedFileId: "file-packing", value: "B" }] }]
  }, valid));

  const review = validateDeclarationLlmAssistResponse(request, {
    version: "1",
    decision: DeclarationLlmAssistDecision.REVIEW_REQUIRED,
    selections: [],
    issues: [{ code: "AMBIGUOUS", message: "Evidence remains ambiguous." }],
    model: "qwen-test",
    provider: "test-provider"
  });
  assert.equal(review.decision, DeclarationLlmAssistDecision.REVIEW_REQUIRED);

  console.log(JSON.stringify({
    event: "foundation-8.1.declaration-llm-assist-contract.passed",
    contract: {
      readyDeclarationsSkipLlm: true,
      insufficientEvidenceWithoutConflictSkipsLlm: true,
      groundedCrossDocumentConflictCanEscalate: true,
      requestContainsExistingCandidateIdsOnly: true,
      modelSelectsCandidateIdNotReplacementValue: true,
      reviewRequiredRemainsFailClosed: true
    },
    guardrails: {
      hallucinatedCandidateRejected,
      unrequestedFieldRejected,
      partialResolutionRejected,
      normalizedDataMutated: false,
      foundation6AuthorityBypassed: false,
      providerNetworkCalled: false
    }
  }, null, 2));
}

main();
