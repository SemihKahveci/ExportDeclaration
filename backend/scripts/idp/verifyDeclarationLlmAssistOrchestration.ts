import assert from "node:assert/strict";
import mongoose from "mongoose";
import { env } from "../../src/config/env.js";
import { DeclarationModel } from "../../src/modules/declarations/declaration.model.js";
import { DeclarationIntelligenceAssessmentRunModel } from "../../src/modules/idp/domain/declarationIntelligenceAssessment.model.js";
import { DeclarationLlmAssistRunModel } from "../../src/modules/idp/domain/declarationLlmAssistRun.model.js";
import { DeclarationLlmAssistDecision, type DeclarationLlmAssistRequest, type DeclarationLlmAssistResponse } from "../../src/modules/idp/domain/declarationLlmAssist.types.js";
import { orchestrateDeclarationLlmAssist } from "../../src/modules/idp/llm/orchestrateDeclarationLlmAssist.js";
import type { DeclarationLlmAssistProvider } from "../../src/modules/idp/llm/resolveDeclarationConflictsWithLlm.js";

class CountingProvider implements DeclarationLlmAssistProvider {
  readonly name = "foundation-8.3-counting-provider";
  calls = 0;
  async resolveDeclarationConflicts(request: DeclarationLlmAssistRequest): Promise<DeclarationLlmAssistResponse> {
    this.calls += 1;
    return {
      version: "1",
      decision: DeclarationLlmAssistDecision.RESOLVED,
      selections: request.fields.map((field) => ({ field: field.field, candidateId: field.candidates[0].candidateId })),
      issues: [],
      model: "fixture-qwen",
      provider: this.name
    };
  }
}

function coverage(status: "COMPLETE" | "INCOMPLETE" = "COMPLETE") {
  return { status, profileVersion: "1", physicalDocumentCount: 2, logicalDocumentCount: 2, requirements: [], issues: [] } as any;
}

function consistency(kind: "CONSISTENT" | "INSUFFICIENT" | "CONFLICT") {
  if (kind === "CONSISTENT") return { status: "CONSISTENT", fields: [], conflictFields: [], insufficientEvidenceFields: [] } as any;
  if (kind === "INSUFFICIENT") return {
    status: "REVIEW_REQUIRED", conflictFields: [], insufficientEvidenceFields: ["goodsLines.0.quantity"],
    fields: [{ field: "goodsLines.0.quantity", status: "INSUFFICIENT_EVIDENCE", documentTypes: ["INVOICE", "PACKING_LIST"], missingDocumentTypes: ["PACKING_LIST"], observations: [{ candidateId: "invoice-q2", documentType: "INVOICE", logicalDocumentId: "ld-invoice", uploadedFileId: "uf-invoice", value: 2 }], reason: "MISSING_CONFIGURED_DOCUMENT_TYPE" }]
  } as any;
  return {
    status: "REVIEW_REQUIRED", conflictFields: ["goodsLines.0.quantity"], insufficientEvidenceFields: [],
    fields: [{ field: "goodsLines.0.quantity", status: "CONFLICT", documentTypes: ["INVOICE", "PACKING_LIST"], missingDocumentTypes: [], observations: [
      { candidateId: "invoice-q2", documentType: "INVOICE", logicalDocumentId: "ld-invoice", uploadedFileId: "uf-invoice", value: 2 },
      { candidateId: "packing-q3", documentType: "PACKING_LIST", logicalDocumentId: "ld-packing", uploadedFileId: "uf-packing", value: 3 }
    ], reason: "VALUE_MISMATCH" }]
  } as any;
}

async function createAssessment(companyId: mongoose.Types.ObjectId, declarationId: mongoose.Types.ObjectId, kind: "READY" | "INSUFFICIENT" | "CONFLICT") {
  const run = await DeclarationIntelligenceAssessmentRunModel.create({
    companyId, declarationId, coverage: coverage(), consistency: consistency(kind === "READY" ? "CONSISTENT" : kind),
    readiness: kind === "READY"
      ? { status: "READY", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "CONSISTENT" }
      : { status: "REVIEW_REQUIRED", issues: [], coverageStatus: "COMPLETE", consistencyStatus: "REVIEW_REQUIRED" },
    assessmentKey: `f83-${kind}-${new mongoose.Types.ObjectId()}`
  });
  await DeclarationModel.updateOne({ _id: declarationId, companyId }, { $set: { idpIntelligence: { version: "1", assessmentRunId: run._id, status: run.readiness.status, issues: [], assessedAt: run.createdAt } } });
  return run;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const companyId = new mongoose.Types.ObjectId();
  const declaration = await DeclarationModel.create({ companyId });
  const provider = new CountingProvider();
  try {
    const noAssessmentDeclaration = await DeclarationModel.create({ companyId });
    assert.deepEqual(await orchestrateDeclarationLlmAssist({ companyId, declarationId: noAssessmentDeclaration._id, provider }), { status: "SKIPPED", reason: "NO_CURRENT_ASSESSMENT" });
    assert.equal(provider.calls, 0);

    await createAssessment(companyId, declaration._id, "READY");
    assert.deepEqual(await orchestrateDeclarationLlmAssist({ companyId, declarationId: declaration._id, provider }), { status: "SKIPPED", reason: "ASSESSMENT_READY" });
    assert.equal(provider.calls, 0);

    await createAssessment(companyId, declaration._id, "INSUFFICIENT");
    assert.deepEqual(await orchestrateDeclarationLlmAssist({ companyId, declarationId: declaration._id, provider }), { status: "SKIPPED", reason: "NO_GROUNDED_CONFLICT" });
    assert.equal(provider.calls, 0);

    const conflictAssessment = await createAssessment(companyId, declaration._id, "CONFLICT");
    const beforeAssist = await DeclarationModel.findById(declaration._id).lean();
    const beforeNormalized = JSON.stringify(beforeAssist?.normalizedData ?? null);
    const first = await orchestrateDeclarationLlmAssist({ companyId, declarationId: declaration._id, provider });
    assert.equal(first.status, "ASSISTED");
    if (first.status !== "ASSISTED") throw new Error("Expected ASSISTED.");
    assert.equal(first.decision, "RESOLVED");
    assert.equal(first.reusedAssistRun, false);
    assert.equal(provider.calls, 1);

    const saved = await DeclarationModel.findById(declaration._id).lean();
    assert.equal(String(saved?.idpLlmAssist?.assessmentRunId), String(conflictAssessment._id));
    assert.equal(saved?.idpLlmAssist?.decision, "RESOLVED");
    assert.deepEqual(saved?.idpLlmAssist?.selections, [{ field: "goodsLines.0.quantity", candidateId: "invoice-q2" }]);
    assert.equal(JSON.stringify(saved?.normalizedData ?? null), beforeNormalized);

    const replay = await orchestrateDeclarationLlmAssist({ companyId, declarationId: declaration._id, provider });
    assert.equal(replay.status, "ASSISTED");
    if (replay.status !== "ASSISTED") throw new Error("Expected ASSISTED replay.");
    assert.equal(replay.assistRunId, first.assistRunId);
    assert.equal(replay.reusedAssistRun, true);
    assert.equal(provider.calls, 1);
    assert.equal(await DeclarationLlmAssistRunModel.countDocuments({ companyId, declarationId: declaration._id }), 1);

    const otherCompany = new mongoose.Types.ObjectId();
    await assert.rejects(() => orchestrateDeclarationLlmAssist({ companyId: otherCompany, declarationId: declaration._id, provider }), /not found in company scope/i);
    assert.equal(provider.calls, 1);

    const secondAssessment = await createAssessment(companyId, declaration._id, "CONFLICT");
    const second = await orchestrateDeclarationLlmAssist({ companyId, declarationId: declaration._id, provider });
    assert.equal(second.status, "ASSISTED");
    if (second.status !== "ASSISTED") throw new Error("Expected second ASSISTED.");
    assert.notEqual(second.assistRunId, first.assistRunId);
    assert.equal(provider.calls, 2);
    assert.equal(await DeclarationLlmAssistRunModel.countDocuments({ companyId, declarationId: declaration._id }), 2);
    const final = await DeclarationModel.findById(declaration._id).lean();
    assert.equal(String(final?.idpLlmAssist?.assessmentRunId), String(secondAssessment._id));

    console.log(JSON.stringify({
      event: "foundation-8.3.declaration-llm-assist-orchestration.passed",
      orchestration: {
        currentAssessmentLoaded: true,
        readyAssessmentSkippedBeforeProvider: true,
        insufficientEvidenceSkippedBeforeProvider: true,
        groundedConflictInvokedProvider: true,
        validatedSelectionPersisted: true,
        exactReplayReusedAssistRun: true,
        changedAssessmentCreatedNewAssistRun: true
      },
      guardrails: {
        companyIsolation: true,
        appendOnlyAudit: true,
        normalizedDataMutated: false,
        foundation6AuthorityBypassed: false,
        skippedCasesCalledProvider: false,
        duplicateAssistRunCreated: false
      }
    }, null, 2));
  } finally {
    await DeclarationLlmAssistRunModel.deleteMany({ companyId });
    await DeclarationIntelligenceAssessmentRunModel.deleteMany({ companyId });
    await DeclarationModel.deleteMany({ companyId });
    await mongoose.disconnect();
  }
}

main().catch(async (error) => { console.error(error); try { await mongoose.disconnect(); } catch {} process.exitCode = 1; });
