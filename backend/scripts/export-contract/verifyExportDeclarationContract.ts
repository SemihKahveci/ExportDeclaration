import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import type { NormalizedDeclaration } from "../../src/modules/normalization/normalizedDeclaration.types.js";
import { buildExportDeclarationContract } from "../../src/modules/export-contract/exportDeclarationContract.service.js";

const fixtures = [
  { declarationId: "6aad3237ca6e4f9c2d1554f5", lines: 56, packageType: "Bin", totalPackage: 2, grossKg: 554, netKg: 530 },
  { declarationId: "6aad3295ca6e4f9c2d155507", lines: 41, packageType: "Bin", totalPackage: 1, grossKg: 162, netKg: 147 }
];

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  try {
    const results = [];
    for (const fixture of fixtures) {
      const declaration = await DeclarationModel.findById(fixture.declarationId).lean();
      assert.ok(declaration, `Declaration not found: ${fixture.declarationId}`);
      const normalized = declaration.normalizedData as NormalizedDeclaration;
      assert.ok(normalized, `NormalizedDeclaration missing: ${fixture.declarationId}`);

      const contract = buildExportDeclarationContract(normalized);
      assert.equal(contract.readiness.ready, true, JSON.stringify(contract.readiness.issues));
      assert.equal(contract.lines.length, fixture.lines);
      assert.equal(contract.package.packageType, fixture.packageType);
      assert.equal(contract.package.totalPackage, fixture.totalPackage);
      assert.equal(contract.package.grossKg, fixture.grossKg);
      assert.equal(contract.package.netKg, fixture.netKg);
      assert.ok(contract.lines.every((line) => line.hsCode && line.productCode && line.description));

      results.push({
        declarationId: fixture.declarationId,
        ready: contract.readiness.ready,
        lineCount: contract.lines.length,
        package: contract.package
      });
    }

    const incomplete = buildExportDeclarationContract({
      header: {}, parties: {}, trade: {}, transport: {}, packageInfo: {}, goodsLines: []
    });
    assert.equal(incomplete.readiness.ready, false);
    assert.ok(incomplete.readiness.issues.some((item) => item.path === "package.packageType"));
    assert.ok(incomplete.readiness.issues.some((item) => item.path === "lines"));

    console.log(JSON.stringify({ event: "export.contract.regression.passed", results, failClosed: true }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "export.contract.regression.failed", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
