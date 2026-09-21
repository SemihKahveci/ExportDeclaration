import assert from "node:assert/strict";

const API = process.env.API_BASE_URL ?? "http://backend:3000";
const DECLARATION_ID = "6aad3295ca6e4f9c2d155507";

async function waitForBackend() {
  let last: unknown;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${API}/api/auth/login`, { method: "OPTIONS" });
      if (r.status < 500) return;
    } catch (e) { last = e; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw last ?? new Error("Backend readiness timeout");
}

async function login() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  assert.ok(email && password, "SUPERADMIN_EMAIL/PASSWORD are required");
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0]!;
}

function hasPhysicalEvidence(entry: any) {
  const e = entry?.evidence;
  return !!e &&
    e.contentSource !== "DERIVED" &&
    Number.isInteger(e.pageNumber) &&
    typeof e.uploadedFileId === "string" &&
    !!e.bbox &&
    [e.bbox.x0, e.bbox.y0, e.bbox.x1, e.bbox.y1].every(Number.isFinite) &&
    e.bbox.x1 > e.bbox.x0 &&
    e.bbox.y1 > e.bbox.y0;
}

async function main() {
  await waitForBackend();
  const cookie = await login();
  const r = await fetch(`${API}/api/declarations/${DECLARATION_ID}/control-provenance`, { headers: { cookie } });
  const body: any = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);

  const entries: any[] = body.data.entries;
  const normalized = entries.filter(e => e.authority === "NORMALIZED_DECLARATION");
  const covered = normalized.filter(hasPhysicalEvidence);
  const missing = normalized.filter(e => !hasPhysicalEvidence(e));
  const masterData = entries.filter(e => e.authority === "MASTER_DATA");
  const persistentHuman = entries.filter(e => e.authority === "PERSISTENT_HUMAN");

  assert.ok(normalized.length > 0, "No NORMALIZED_DECLARATION entries");
  assert.ok(covered.length > 0, "No document-backed entries have physical bbox evidence");
  assert.equal(
    missing.length,
    0,
    `Known 0110 canonical fixture has normalized fields without physical evidence: ${missing.map(e => e.path).join(", ")}`
  );

  const byTopLevel = (rows: any[]) => rows.reduce<Record<string, number>>((acc, e) => {
    const key = String(e.path).split(".")[0] || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    event: "declaration-evidence.coverage.report",
    declarationId: DECLARATION_ID,
    totalEffectiveFields: entries.length,
    normalizedAuthorityFields: normalized.length,
    physicalBboxCovered: covered.length,
    physicalBboxMissing: missing.length,
    physicalBboxCoveragePct: Number(((covered.length / normalized.length) * 100).toFixed(2)),
    excludedFromPhysicalCoverage: {
      masterData: masterData.length,
      persistentHuman: persistentHuman.length,
    },
    coveredByTopLevel: byTopLevel(covered),
    missingByTopLevel: byTopLevel(missing),
    missing: missing.map(e => ({
      path: e.path,
      label: e.label,
      value: e.value,
      evidence: e.evidence ?? null,
    })),
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
