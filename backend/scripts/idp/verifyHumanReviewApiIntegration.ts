import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { ProcessingRunModel } from "../../src/modules/idp/domain/processingRun.model.js";
import { HumanReviewDecisionModel } from "../../src/modules/idp/domain/humanReviewDecision.model.js";

const API_BASE = process.env.HUMAN_REVIEW_TEST_API_BASE ?? "http://localhost:3000";
const email = process.env.SUPERADMIN_EMAIL;
const password = process.env.SUPERADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("SUPERADMIN_EMAIL ve SUPERADMIN_PASSWORD integration testi için gerekli.");
}

const candidate = {
  candidateId: "integration:goodsLines.0.productCode:0",
  field: "goodsLines.0.productCode",
  value: "API-TEST-001",
  confidence: 0.91,
  extractor: "human-review-api-integration-test",
  evidence: [{
    segmentId: "segment-001",
    pageNumber: 1,
    bbox: { x0: 0.1, y0: 0.2, x1: 0.2, y1: 0.22 },
    contentSource: "NATIVE_TEXT",
    text: "API-TEST-001"
  }]
};

async function jsonResponse(response: Response) {
  const text = await response.text();
  let body: any;
  try { body = text ? JSON.parse(text) : undefined; }
  catch { body = text; }
  return { response, body };
}

async function main() {
  await mongoose.connect(env.mongoUri);
  let fixtureRunId: mongoose.Types.ObjectId | undefined;

  try {
    if (!env.installationCompanyId || !mongoose.isValidObjectId(env.installationCompanyId)) {
      throw new Error("INSTALLATION_COMPANY_ID integration testi için geçerli bir ObjectId olmalı.");
    }

    const companyId = new mongoose.Types.ObjectId(env.installationCompanyId);
    const baseline = await ProcessingRunModel.findOne({ companyId }).sort({ createdAt: -1 }).lean();
    if (!baseline) throw new Error("INSTALLATION_COMPANY_ID için mevcut ProcessingRun bulunamadı. Önce normal bir PDF run'ı oluştur.");

    const fixture = await ProcessingRunModel.create({
      companyId,
      declarationId: baseline.declarationId,
      uploadedFileId: baseline.uploadedFileId,
      logicalDocumentId: baseline.logicalDocumentId,
      status: baseline.status,
      currentStage: baseline.currentStage,
      attempt: 1,
      processorVersion: "human-review-api-integration-test",
      candidates: {
        segments: [{
          segmentId: "segment-001",
          data: {
            genericCandidateAudit: {
              mode: "SHADOW",
              candidates: {
                version: "1",
                fields: { "goodsLines.0.productCode": [candidate] }
              },
              validation: {
                status: "REVIEW_REQUIRED",
                summary: {
                  rowCount: 1,
                  validRowCount: 0,
                  reviewRequiredRowCount: 1,
                  issueCount: 1,
                  reasonCounts: { TEST_REVIEW_REQUIRED: 1 }
                },
                rows: [{
                  rowIndex: 0,
                  status: "REVIEW_REQUIRED",
                  issues: [{
                    rowIndex: 0,
                    field: "goodsLines.0.productCode",
                    code: "TEST_REVIEW_REQUIRED",
                    message: "Synthetic API integration review issue"
                  }]
                }]
              }
            }
          }
        }]
      }
    });
    fixtureRunId = fixture._id as mongoose.Types.ObjectId;

    const login = await jsonResponse(await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    }));
    assert.equal(login.response.status, 200, `Login failed: ${JSON.stringify(login.body)}`);
    const setCookie = login.response.headers.get("set-cookie");
    assert.ok(setCookie, "Login response Set-Cookie içermiyor.");
    const cookie = setCookie.split(";", 1)[0]!;

    const declarationId = String(baseline.declarationId);
    const runId = String(fixture._id);
    const reviewUrl = `${API_BASE}/api/declarations/${declarationId}/idp-reviews/${runId}`;
    const decisionsUrl = `${reviewUrl}/decisions`;

    const review = await jsonResponse(await fetch(reviewUrl, { headers: { cookie } }));
    assert.equal(review.response.status, 200, `GET review failed: ${JSON.stringify(review.body)}`);
    assert.equal(review.body?.data?.issues?.length, 1);
    assert.equal(review.body?.data?.pendingIssueCount, 1);
    const issue = review.body.data.issues[0];
    assert.equal(issue.source, "GENERIC_EVIDENCE");
    assert.deepEqual(issue.candidateIds, [candidate.candidateId]);
    assert.equal(issue.evidence?.[0]?.text, candidate.evidence[0].text);

    const accept = await jsonResponse(await fetch(decisionsUrl, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        issueId: issue.issueId,
        action: "ACCEPT_CANDIDATE",
        candidateId: candidate.candidateId,
        reason: "integration-test-accept"
      })
    }));
    assert.equal(accept.response.status, 201, `ACCEPT_CANDIDATE failed: ${JSON.stringify(accept.body)}`);
    assert.equal(accept.body?.data?.value, candidate.value);

    const invalidCandidate = await jsonResponse(await fetch(decisionsUrl, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        issueId: issue.issueId,
        action: "ACCEPT_CANDIDATE",
        candidateId: "not-allowed-candidate"
      })
    }));
    assert.equal(invalidCandidate.response.status, 400, `Invalid candidate should be 400: ${JSON.stringify(invalidCandidate.body)}`);

    const override = await jsonResponse(await fetch(decisionsUrl, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        issueId: issue.issueId,
        action: "OVERRIDE_VALUE",
        value: "API-TEST-OVERRIDE",
        reason: "integration-test-override"
      })
    }));
    assert.equal(override.response.status, 201, `OVERRIDE_VALUE failed: ${JSON.stringify(override.body)}`);

    const decisions = await jsonResponse(await fetch(decisionsUrl, { headers: { cookie } }));
    assert.equal(decisions.response.status, 200, `GET decisions failed: ${JSON.stringify(decisions.body)}`);
    assert.equal(decisions.body?.data?.length, 2, "Decision history append-only olmalı; iki karar bekleniyordu.");
    assert.deepEqual(decisions.body.data.map((d: any) => d.action), ["ACCEPT_CANDIDATE", "OVERRIDE_VALUE"]);

    const reviewAfter = await jsonResponse(await fetch(reviewUrl, { headers: { cookie } }));
    assert.equal(reviewAfter.response.status, 200);
    assert.equal(reviewAfter.body?.data?.decisionCount, 2);
    assert.equal(reviewAfter.body?.data?.pendingIssueCount, 0);

    const wrongDeclarationId = new mongoose.Types.ObjectId().toString();
    const tenantBoundary = await jsonResponse(await fetch(
      `${API_BASE}/api/declarations/${wrongDeclarationId}/idp-reviews/${runId}`,
      { headers: { cookie } }
    ));
    assert.equal(tenantBoundary.response.status, 404, "Run başka declaration path'i üzerinden erişilebilir olmamalı.");

    console.log(JSON.stringify({
      event: "idp.human-review.api-integration.passed",
      fixtureRunId: runId,
      issueCount: 1,
      candidateEvidenceReturned: true,
      acceptedCandidate: true,
      invalidCandidateRejected: true,
      appendOnlyDecisionCount: 2,
      pendingIssueCountAfterDecision: 0,
      declarationBoundaryProtected: true
    }, null, 2));
  } finally {
    if (fixtureRunId) {
      await HumanReviewDecisionModel.deleteMany({ processingRunId: fixtureRunId });
      await ProcessingRunModel.deleteOne({ _id: fixtureRunId, processorVersion: "human-review-api-integration-test" });
    }
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
