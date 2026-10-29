import assert from "node:assert/strict";
import { classifyMaterialImportRows } from "../../src/modules/material-records/materialRecordImport.js";

const existing = [
  { id: "a", materialNo: "MLZ-1", description: "Conta", gtipNo: "0102.21.10.00.00" },
  { id: "b", materialNo: "MLZ-2", description: "Vida", gtipNo: "7318.15.90.90.00" },
  { id: "c", materialNo: "MLZ-3", description: "Conta", gtipNo: "4016.93.00.00.00" }
];

const result = classifyMaterialImportRows([
  { row: 2, item: { materialNo: "mlz-1", description: "Conta", gtipNo: "010221100000" } },
  { row: 3, item: { materialNo: "MLZ-1", description: "Conta", gtipNo: "9999.00.00.00.00" } },
  { row: 4, item: { materialNo: "MLZ-9", description: "Vida", gtipNo: "7318.15.90.90.00" } },
  { row: 5, item: { materialNo: "MLZ-8", description: "Conta", gtipNo: "1111.00.00.00.00" } },
  { row: 6, item: { materialNo: "MLZ-7", description: "Yeni malzeme", gtipNo: "1234.56.78.90.00" } }
], existing);

assert.equal(result.skippedIdentical, 1);
assert.equal(result.create.length, 1);
assert.equal(result.create[0]?.item.materialNo, "MLZ-7");
assert.equal(result.conflicts.length, 2);
assert.deepEqual(result.conflicts[0]?.differingFields, ["gtipNo"]);
assert.equal(result.conflicts[0]?.existingId, "a");
assert.deepEqual(result.conflicts[1]?.differingFields, ["materialNo"]);
assert.equal(result.conflicts[1]?.existingId, "b");
assert.equal(result.errors.length, 1);
assert.match(result.errors[0]?.message ?? "", /birden fazla/);

console.log(JSON.stringify({ event: "material-import.classify.passed", skippedIdentical: 1, conflicts: 2, created: 1, ambiguous: 1 }));
