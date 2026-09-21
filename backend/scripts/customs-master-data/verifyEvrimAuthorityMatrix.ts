import assert from "node:assert/strict";
import { EVRIM_EXCEL_HEADERS } from "../../src/modules/evrim-excel/evrimExcelAdapter.types.js";
import { EVRIM_EXCEL_AUTHORITY_MATRIX } from "../../src/modules/export-code-tables/evrimExcelAuthorityMatrix.js";
import {
  mapEvrimPackageType,
  mapEvrimQuantityUnit,
} from "../../src/modules/export-code-tables/exportCodeTables.js";

assert.equal(EVRIM_EXCEL_AUTHORITY_MATRIX.length, 24);
assert.deepEqual(EVRIM_EXCEL_AUTHORITY_MATRIX.map(x=>x.index), Array.from({length:24},(_,i)=>i+1));
assert.deepEqual(EVRIM_EXCEL_AUTHORITY_MATRIX.map(x=>x.header), Array.from(EVRIM_EXCEL_HEADERS));
assert(EVRIM_EXCEL_AUTHORITY_MATRIX.every(x=>x.authority.length>0));
assert(EVRIM_EXCEL_AUTHORITY_MATRIX.every(x=>x.currentSource.trim().length>0));

assert.equal(mapEvrimPackageType("Bin"),"BI");
assert.equal(mapEvrimPackageType("UNKNOWN"),"UNKNOWN");
assert.equal(mapEvrimQuantityUnit("PCS"),"ADET");
assert.equal(mapEvrimQuantityUnit("Adet"),"ADET");
assert.equal(mapEvrimQuantityUnit("kg"),"KG");

const unresolved=EVRIM_EXCEL_AUTHORITY_MATRIX.filter(x=>x.status==="UNRESOLVED").map(x=>`${x.index}:${x.header}`);
const active=EVRIM_EXCEL_AUTHORITY_MATRIX.filter(x=>x.status==="ACTIVE").length;
const partial=EVRIM_EXCEL_AUTHORITY_MATRIX.filter(x=>x.status==="PARTIAL").length;

console.log(JSON.stringify({
  event:"evrim-excel.authority-matrix.regression.passed",
  columns:24,
  active,
  partial,
  unresolved,
  verifiedMappings:{packageType:"Bin -> BI",quantityUnit:["PCS -> ADET","Adet -> ADET"],unknownPassThrough:true},
  policy:"NO_UNPROVEN_CUSTOMS_SEMANTICS"
},null,2));
