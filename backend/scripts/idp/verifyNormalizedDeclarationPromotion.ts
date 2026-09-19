import assert from "node:assert/strict";
import { buildEffectiveInvoiceGoodsLines } from "../../src/modules/idp/normalization/effectiveInvoiceNormalizer.js";

function candidate(field: string, value: unknown, id: string, derived = false) {
  return { candidateId: id, field, value, confidence: derived ? 0.82 : 0.9, extractor: "test-generic", derived, evidence: [{ segmentId: "segment-001", pageNumber: 1, contentSource: "NATIVE_TEXT" as const, text: String(value) }] };
}
const fields: Record<string, any[]> = {};
const add = (name: string, values: Array<[unknown,string,boolean?]>) => fields[`goodsLines.0.${name}`] = values.map(([v,id,d]) => candidate(`goodsLines.0.${name}`, v, id, Boolean(d)));
add("hsCode", [["853620900019","hs"]]);
add("productCode", [["AG.EAT.216384","pc-full"],["EAT.216384","pc-derived",true],["216384","pc-derived-2",true]]);
add("description", [["M22-CK10 YARDIMCI KONTAK","desc"]]);
add("quantity", [[15,"qty"]]);
add("unit", [["PCS","unit"]]);
add("unitPrice", [[106.8,"price"]]);
add("lineTotal", [[1602,"total"]]);
const audit: any = { version:"1", mode:"SHADOW", candidates:{version:"1",fields}, validation:{status:"VALID"}, migration:{promotable:true,promotion:{status:"READY",reasons:[]}} };

const base = buildEffectiveInvoiceGoodsLines(audit);
assert.equal(base.goodsLines.length, 1);
assert.equal(base.goodsLines[0]?.productCode, "AG.EAT.216384");
assert.equal(base.trace["goodsLines.0.productCode"]?.source, "IDP_GENERIC");

const reviewed = buildEffectiveInvoiceGoodsLines(audit, [
  { field:"goodsLines.0.description", action:"OVERRIDE_VALUE", value:"HUMAN CORRECTED DESCRIPTION" },
  { field:"goodsLines.0.description", action:"OVERRIDE_VALUE", value:"LATEST HUMAN DESCRIPTION" }
]);
assert.equal(reviewed.goodsLines[0]?.description, "LATEST HUMAN DESCRIPTION");
assert.equal(reviewed.trace["goodsLines.0.description"]?.source, "HUMAN_REVIEW");

assert.throws(() => buildEffectiveInvoiceGoodsLines(audit, [{ field:"goodsLines.0.quantity", action:"OVERRIDE_VALUE", value:16 }]), /quantity × unitPrice/);

const ambiguousAudit: any = structuredClone(audit);
ambiguousAudit.candidates.fields["goodsLines.0.description"] = [candidate("goodsLines.0.description","A","a"), candidate("goodsLines.0.description","B","b")];
assert.throws(() => buildEffectiveInvoiceGoodsLines(ambiguousAudit), /human review is required/);

console.log(JSON.stringify({ event:"idp.normalized-declaration-promotion.regression.passed", genericProductCode:"AG.EAT.216384", humanReviewOverlay:true, arithmeticGuard:true, ambiguityGuard:true }, null, 2));
