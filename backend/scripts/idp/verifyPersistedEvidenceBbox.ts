import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://backend:3000";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://mongo:27017/export_declaration";
const DECLARATION_ID = "6aad3295ca6e4f9c2d155507";
const RUN_ID = "6aad3295ca6e4f9c2d155513";
const UPLOADED_FILE_ID = "6aad3295ca6e4f9c2d15550d";

type BBox = { x0: number; y0: number; x1: number; y1: number };
type Evidence = {
  segmentId?: string;
  pageNumber?: number;
  bbox?: BBox;
  text?: string;
  contentSource?: string;
};
type Candidate = {
  candidateId?: string;
  field?: string;
  value?: unknown;
  confidence?: number;
  extractor?: string;
  evidence?: Evidence[];
};

function cookieHeader(setCookie: string | null): string {
  if (!setCookie) throw new Error("Login response did not return a session cookie.");
  return setCookie.split(";")[0]!;
}

async function login(): Promise<string> {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) throw new Error("SUPERADMIN_EMAIL/PASSWORD are required.");
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.text();
  assert.equal(response.status, 200, `Login failed: ${response.status} ${body}`);
  return cookieHeader(response.headers.get("set-cookie"));
}

function candidateEnvelopes(run: any): Array<{ source: string; envelope: any }> {
  const result: Array<{ source: string; envelope: any }> = [];
  const segments = run?.candidates?.segments;
  if (!Array.isArray(segments)) return result;
  for (const segment of segments) {
    const audit = segment?.data?.genericCandidateAudit;
    if (!audit) continue;
    for (const key of ["candidates", "headerPartyCandidates", "commercialTermsCandidates", "shipmentCandidates", "originCandidates"]) {
      if (audit[key]?.fields) result.push({ source: `${segment.segmentId ?? "segment"}.${key}`, envelope: audit[key] });
    }
  }
  return result;
}

function findPersistedEvidence(run: any): { source: string; candidate: Candidate; evidence: Evidence } | null {
  for (const { source, envelope } of candidateEnvelopes(run)) {
    for (const candidates of Object.values(envelope.fields ?? {}) as Candidate[][]) {
      for (const candidate of candidates ?? []) {
        for (const evidence of candidate.evidence ?? []) {
          const b = evidence.bbox;
          if (
            evidence.contentSource !== "DERIVED" &&
            Number.isInteger(evidence.pageNumber) &&
            b &&
            [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite)
          ) return { source, candidate, evidence };
        }
      }
    }
  }
  return null;
}

function assertNormalizedBBox(b: BBox): void {
  assert.ok(b.x0 >= 0 && b.x0 <= 1, "bbox.x0 is outside normalized range.");
  assert.ok(b.y0 >= 0 && b.y0 <= 1, "bbox.y0 is outside normalized range.");
  assert.ok(b.x1 >= 0 && b.x1 <= 1, "bbox.x1 is outside normalized range.");
  assert.ok(b.y1 >= 0 && b.y1 <= 1, "bbox.y1 is outside normalized range.");
  assert.ok(b.x1 > b.x0, "bbox width must be positive.");
  assert.ok(b.y1 > b.y0, "bbox height must be positive.");
}

async function main(): Promise<void> {
  const mongo = new MongoClient(MONGODB_URI);
  await mongo.connect();
  try {
    const db = mongo.db();
    const run = await db.collection("processingruns").findOne({
      _id: new ObjectId(RUN_ID),
      declarationId: new ObjectId(DECLARATION_ID),
      uploadedFileId: new ObjectId(UPLOADED_FILE_ID),
    });
    assert.ok(run, "Known 0110 ProcessingRun was not found.");

    const found = findPersistedEvidence(run);
    assert.ok(found, "No persisted physical evidence with bbox was found in the known 0110 run.");
    const { candidate, evidence, source } = found;
    assert.ok(evidence.bbox);
    assertNormalizedBBox(evidence.bbox);
    assert.ok((evidence.pageNumber ?? 0) >= 1, "Evidence page number must be >= 1.");

    // The exact persisted evidence page must be renderable from the run's exact UploadedFile.
    const cookie = await login();
    const response = await fetch(
      `${API_BASE_URL}/api/declarations/${DECLARATION_ID}/documents/${UPLOADED_FILE_ID}/pages/${evidence.pageNumber}/image`,
      { headers: { cookie } }
    );
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, `Evidence page render failed: ${response.status}`);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Evidence page response is not PNG.");

    // Validate the exact percentage geometry consumed by DocumentEvidenceViewer.
    const b = evidence.bbox;
    const overlay = {
      leftPct: b.x0 * 100,
      topPct: b.y0 * 100,
      widthPct: (b.x1 - b.x0) * 100,
      heightPct: (b.y1 - b.y0) * 100,
    };
    assert.ok(overlay.leftPct >= 0 && overlay.leftPct < 100);
    assert.ok(overlay.topPct >= 0 && overlay.topPct < 100);
    assert.ok(overlay.widthPct > 0 && overlay.leftPct + overlay.widthPct <= 100.000001);
    assert.ok(overlay.heightPct > 0 && overlay.topPct + overlay.heightPct <= 100.000001);

    console.log(JSON.stringify({
      event: "document-evidence-viewer.persisted-bbox-regression.passed",
      declarationId: DECLARATION_ID,
      processingRunId: RUN_ID,
      uploadedFileId: UPLOADED_FILE_ID,
      candidateSource: source,
      candidateId: candidate.candidateId,
      field: candidate.field,
      value: candidate.value,
      extractor: candidate.extractor,
      contentSource: evidence.contentSource,
      pageNumber: evidence.pageNumber,
      evidenceText: evidence.text,
      bbox: evidence.bbox,
      overlay,
      pageRenderedFromExactUploadedFile: true,
      persistedEvidenceUnmodified: true
    }, null, 2));
  } finally {
    await mongo.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
