import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ExportAuditModel } from "../../src/modules/export-audit/exportAudit.model.js";

const API = process.env.CUSTOMS_MASTER_TEST_API_BASE ?? "http://backend:3000";
const declarationId = "6aad3237ca6e4f9c2d1554f5";
const email = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;
if (!email || !password) throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD gerekli.");

async function jsonResponse(r: Response) {
  const text = await r.text();
  let body: any;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { r, body };
}

function assertPlainSnapshot(value: unknown, name: string) {
  assert(value !== undefined && value !== null, `${name} persist edilmemiş.`);
  assert(typeof value === "object" && !Array.isArray(value), `${name} object olmalı.`);
}

async function main() {
  await mongoose.connect(env.mongoUri);
  let auditId: mongoose.Types.ObjectId | undefined;
  try {
    const login = await jsonResponse(await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }));
    assert.equal(login.r.status, 200, JSON.stringify(login.body));
    const setCookie = login.r.headers.get("set-cookie");
    assert(setCookie);
    const cookie = setCookie.split(";", 1)[0]!;

    const before = await ExportAuditModel.countDocuments({ declarationId });

    const response = await fetch(`${API}/api/declarations/${declarationId}/exports/evrim-excel`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        supplements: { lines: { "line:1": { brand: "AUDIT-SNAPSHOT-BRAND" } } },
      }),
    });
    if (response.status !== 200) {
      const errorBody = await response.text();
      assert.fail(`export ${response.status}: ${errorBody}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const audit: any = await ExportAuditModel.findOne({ declarationId, format: "EVRIM_EXCEL" })
      .sort({ createdAt: -1, _id: -1 }).lean();
    assert(audit, "Export audit kaydı oluşturulmadı.");
    auditId = audit._id;

    assert.equal(await ExportAuditModel.countDocuments({ declarationId }), before + 1);

    // Snapshot completeness: empty objects are meaningful audit state and must survive Mongo persistence.
    assertPlainSnapshot(audit.normalizedSnapshot, "normalizedSnapshot");
    assertPlainSnapshot(audit.masterDataSnapshot, "masterDataSnapshot");
    assertPlainSnapshot(audit.persistentHumanSnapshot, "persistentHumanSnapshot");
    assertPlainSnapshot(audit.requestHumanSnapshot, "requestHumanSnapshot");
    assertPlainSnapshot(audit.effectiveSupplementsSnapshot, "effectiveSupplementsSnapshot");
    assertPlainSnapshot(audit.contractSnapshot, "contractSnapshot");
    assertPlainSnapshot(audit.masterDataTraceSnapshot, "masterDataTraceSnapshot");

    assert.equal(audit.requestHumanSnapshot.lines?.["line:1"]?.brand, "AUDIT-SNAPSHOT-BRAND");
    assert.equal(audit.effectiveSupplementsSnapshot.lines?.["line:1"]?.brand, "AUDIT-SNAPSHOT-BRAND");

    assert(Array.isArray(audit.contractSnapshot.lines), "contractSnapshot.lines array olmalı.");
    assert.equal(audit.contractSnapshot.lines.length, 56);
    assert.equal(audit.contractSnapshot.lines[0]?.brand, "AUDIT-SNAPSHOT-BRAND");

    assert.equal(audit.output?.rowCount, 56);
    assert.equal(
      audit.output?.sha256,
      createHash("sha256").update(buffer).digest("hex"),
      "Persist edilen SHA-256 emitted XLSX byte'larıyla eşleşmiyor.",
    );

    // No master-data row is required for this proof; an empty trace is valid and must be frozen as {}.
    assert.equal(Object.getPrototypeOf(audit.masterDataTraceSnapshot), Object.prototype);
    const traceEntryCount = Object.keys(audit.masterDataTraceSnapshot).length;

    let immutableUpdateRejected = false;
    try {
      await ExportAuditModel.updateOne(
        { _id: audit._id },
        { $set: { "output.filename": "MUTATED" } },
      );
    } catch {
      immutableUpdateRejected = true;
    }
    assert.equal(immutableUpdateRejected, true);

    console.log(JSON.stringify({
      event: "export-audit.snapshot.integration.passed",
      declarationId,
      format: "EVRIM_EXCEL",
      rowCount: 56,
      snapshotCompletenessVerified: true,
      masterDataTraceEntryCount: traceEntryCount,
      emptySnapshotsPreserved: true,
      requestHumanFrozen: true,
      effectiveSupplementsFrozen: true,
      contractFrozen: true,
      masterDataTraceFrozen: true,
      outputSha256Verified: true,
      immutableUpdateRejected: true,
    }, null, 2));
  } finally {
    if (auditId) await ExportAuditModel.deleteOne({ _id: auditId });
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
