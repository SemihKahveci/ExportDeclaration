import assert from "node:assert/strict";
import { enforceVisionDocumentRoleAuthority } from "../../src/modules/idp/llm/invoiceProductionWorkerFusion.js";

const candidate = (candidateId: string, field: string, value: unknown) => ({
  candidateId, field, value, confidence: 1, extractor: "invoice-qwen-vision-v1",
  evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "PAGE_IMAGE" as const }]
});
const canonical = (text: string) => ({
  version: "1", pages: [{ pageNumber: 1, width: 1, height: 1, lines: [], words: [
    { text, bbox: { x0: 0, y0: 0, x1: 1, y1: .1 }, source: "NATIVE_TEXT" }
  ] }]
}) as any;

// Same page has a valid package role, but "Bin" is unrelated text far away.
const polluted = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  packageType: [candidate("package-poison", "packageType", "Bin")]
} }, canonical("PACKAGE TYPE: PALLET Invoice notes and commercial details ........................................................ Bin"));
assert.equal(polluted.fields.packageType, undefined, "page-wide package role must not authorize an unrelated value");

const validType = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  packageType: [candidate("package-valid", "packageType", "Pallet")]
} }, canonical("PACKAGE TYPE: PALLET"));
assert.equal(validType.fields.packageType?.[0]?.value, "Pallet");

const pollutedCount = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  totalPackage: [candidate("count-poison", "totalPackage", 21)]
} }, canonical("TOTAL PACKAGES: 8 goods row quantity 21"));
assert.equal(pollutedCount.fields.totalPackage, undefined, "goods quantity must not borrow a package-count label");

const validCount = enforceVisionDocumentRoleAuthority({ version: "1", fields: {
  totalPackage: [candidate("count-valid", "totalPackage", 8)]
} }, canonical("TOTAL PACKAGES: 8"));
assert.equal(validCount.fields.totalPackage?.[0]?.value, 8);

console.log(JSON.stringify({
  event: "product-e2e-1.8.26.role-local-package-authority.contract.passed",
  guardrails: {
    pageWidePackageRoleCannotAuthorizeUnrelatedValue: true,
    roleLocalPackageTypeStillAllowed: true,
    goodsQuantityCannotBecomePackageCount: true,
    roleLocalPackageCountStillAllowed: true,
    supplierSpecificRules: false,
    invoiceSpecificConstants: false,
    directNormalizedWrite: false
  }
}, null, 2));
