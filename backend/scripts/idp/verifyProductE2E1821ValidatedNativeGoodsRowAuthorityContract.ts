import assert from "node:assert/strict";
import { canonicalValidatedNativeGoodsRowCandidatesOf } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";
import { selectDirectSourceEvidenceAuthority } from "../../src/modules/idp/domain/declarationFieldOrchestration.service.js";
import { resolveDeclarationFields } from "../../src/modules/idp/domain/declarationFieldResolver.js";

const provenance = { logicalDocumentId: "logical-1", uploadedFileId: "file-1", documentType: "INVOICE", sourceProcessingRunId: "run-1" };
const native = (field: string, value: unknown) => ({ candidateId: `generic:${field}`, field, value, confidence: .98, extractor: "invoice-generic-layout-v15", evidence: [{ segmentId: "segment-001", pageNumber: 4, contentSource: "NATIVE_TEXT" as const, text: String(value) }] });
const vision = (field: string, value: unknown) => ({ candidateId: `vision:${field}`, field, value, confidence: 1, extractor: "invoice-qwen-vision-v1", evidence: [{ segmentId: "segment-001", pageNumber: 4, contentSource: "PAGE_IMAGE" as const }], ...provenance });

const data: any = { genericCandidateAudit: { candidates: { version: "1", fields: {
  "goodsLines.23.productCode": [native("goodsLines.23.productCode", "AG.SCH.33769")],
  "goodsLines.23.quantity": [native("goodsLines.23.quantity", 2)],
  "goodsLines.23.unit": [native("goodsLines.23.unit", "Adet")],
  "goodsLines.23.lineTotal": [native("goodsLines.23.lineTotal", 48.84)],
  "goodsLines.24.quantity": [native("goodsLines.24.quantity", 99)]
}}, validation: { rows: [
  { rowIndex: 23, status: "VALID", issues: [] },
  { rowIndex: 24, status: "REVIEW_REQUIRED", issues: [{ code: "ARITHMETIC_MISMATCH" }] }
] } } };

const row = canonicalValidatedNativeGoodsRowCandidatesOf(data);
assert.equal(row.fields["goodsLines.23.quantity"]?.[0]?.value, 2);
assert.equal(row.fields["goodsLines.24.quantity"], undefined, "invalid row must stay shadow-only");

const fields: any = {};
for (const field of ["goodsLines.23.productCode", "goodsLines.23.quantity", "goodsLines.23.unit", "goodsLines.23.lineTotal"]) {
  fields[field] = [vision(field, field.endsWith("quantity") ? 200 : field.endsWith("lineTotal") ? 999 : "WRONG"), ...row.fields[field]!.map((c: any) => ({ ...c, ...provenance }))];
}
const envelope: any = { version: "1", companyId: "company-1", declarationId: "declaration-1", fields };
const selections = selectDirectSourceEvidenceAuthority(envelope);
const resolution = resolveDeclarationFields({ candidates: envelope, candidateSelections: selections });
assert.equal(resolution.fields["goodsLines.23.productCode"]?.value, "AG.SCH.33769");
assert.equal(resolution.fields["goodsLines.23.quantity"]?.value, 2);
assert.equal(resolution.fields["goodsLines.23.unit"]?.value, "Adet");
assert.equal(resolution.fields["goodsLines.23.lineTotal"]?.value, 48.84);

console.log(JSON.stringify({ event: "product-e2e-1.8.21.validated-native-goods-row-authority.contract.passed", guardrails: { validNativeRowCanEnterFoundation6: true, invalidRowStaysShadowOnly: true, conflictingVisionCannotOutrankValidatedNativeRow: true, supplierSpecificRules: false, directNormalizedWrite: false } }, null, 2));
