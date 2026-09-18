import mongoose from "mongoose";
import { HttpError } from "../../../common/middlewares/errorHandler.js";
import { ProcessingRunModel } from "../domain/processingRun.model.js";
import { HumanReviewDecisionModel } from "../domain/humanReviewDecision.model.js";
import { HumanReviewDecisionAction, type HumanReviewCase, type HumanReviewIssue } from "../domain/humanReview.types.js";
import type { FieldCandidate, FieldCandidateEnvelope } from "../domain/fieldCandidate.types.js";
import type { CandidateResolutionEnvelope } from "../domain/candidateResolution.types.js";
import type { ValidationEnvelope } from "../domain/validation.types.js";
import type { GenericInvoiceCandidateAudit } from "../domain/genericCandidateIntegration.types.js";

function issueId(parts: Array<string | number | undefined>): string {
  return parts.filter(v => v !== undefined).map(String).join(":");
}

function allCandidates(audit?: GenericInvoiceCandidateAudit): Record<string, FieldCandidate[]> {
  return audit?.candidates?.fields ?? {};
}

function findGenericAudit(run: any): GenericInvoiceCandidateAudit | undefined {
  const segments = run?.candidates?.segments;
  if (!Array.isArray(segments)) return undefined;
  for (const segment of segments) {
    const audit = segment?.data?.genericCandidateAudit as GenericInvoiceCandidateAudit | undefined;
    if (audit) return audit;
  }
  return undefined;
}

export function buildHumanReviewIssues(run: any): HumanReviewIssue[] {
  const issues: HumanReviewIssue[] = [];
  const resolution = run.resolvedResult as CandidateResolutionEnvelope | undefined;
  const validation = run.validationResult as ValidationEnvelope | undefined;
  const audit = findGenericAudit(run);
  const genericCandidates = allCandidates(audit);

  for (const item of resolution?.issues ?? []) {
    issues.push({
      issueId: issueId(["RESOLVE", item.code, item.segmentIds.join(",")]),
      source: "RESOLVE",
      code: item.code,
      message: item.message,
      candidateIds: [],
      candidates: [],
      evidence: []
    });
  }

  for (const item of validation?.issues ?? []) {
    const field = item.path;
    const candidates = field ? (genericCandidates[field] ?? []) : [];
    issues.push({
      issueId: issueId(["VALIDATION", item.code, field, item.lineNo]),
      source: "VALIDATION",
      code: item.code,
      message: item.message,
      field,
      lineNo: item.lineNo,
      rowIndex: typeof item.lineNo === "number" ? Math.max(0, item.lineNo - 1) : undefined,
      candidateIds: candidates.map(c => c.candidateId),
      candidates,
      evidence: candidates.flatMap(c => c.evidence)
    });
  }

  for (const row of audit?.validation?.rows ?? []) {
    for (const item of row.issues) {
      const candidates = item.field ? (genericCandidates[item.field] ?? []) : [];
      issues.push({
        issueId: issueId(["GENERIC_EVIDENCE", item.code, item.rowIndex, item.field]),
        source: "GENERIC_EVIDENCE",
        code: item.code,
        message: item.message,
        field: item.field,
        rowIndex: item.rowIndex,
        candidateIds: candidates.map(c => c.candidateId),
        candidates,
        evidence: candidates.flatMap(c => c.evidence)
      });
    }
  }

  return issues;
}

async function loadRun(companyId: mongoose.Types.ObjectId, processingRunId: string, declarationId?: string) {
  if (!mongoose.isValidObjectId(processingRunId)) throw new HttpError(400, "Geçersiz processing run id.");
  const filter: Record<string, unknown> = { _id: processingRunId, companyId };
  if (declarationId) {
    if (!mongoose.isValidObjectId(declarationId)) throw new HttpError(400, "Geçersiz declaration id.");
    filter.declarationId = declarationId;
  }
  const run = await ProcessingRunModel.findOne(filter).lean();
  if (!run) throw new HttpError(404, "ProcessingRun bulunamadı.");
  return run as any;
}

export async function getHumanReviewCase(companyId: mongoose.Types.ObjectId, processingRunId: string, declarationId?: string): Promise<HumanReviewCase> {
  const run = await loadRun(companyId, processingRunId, declarationId);
  const issues = buildHumanReviewIssues(run);
  const decisions = await HumanReviewDecisionModel.find({ companyId, processingRunId: run._id }).sort({ createdAt: 1 }).lean();
  const decided = new Set(decisions.map(d => d.issueId));
  return {
    version: "1",
    processingRunId: String(run._id),
    declarationId: String(run.declarationId),
    uploadedFileId: String(run.uploadedFileId),
    processingStatus: run.status,
    stage: run.currentStage,
    issues,
    decisionCount: decisions.length,
    pendingIssueCount: issues.filter(i => !decided.has(i.issueId)).length
  };
}

export async function listHumanReviewDecisions(companyId: mongoose.Types.ObjectId, processingRunId: string, declarationId?: string) {
  await loadRun(companyId, processingRunId, declarationId);
  return HumanReviewDecisionModel.find({ companyId, processingRunId }).sort({ createdAt: 1 }).lean();
}

export async function appendHumanReviewDecision(params: {
  companyId: mongoose.Types.ObjectId;
  processingRunId: string;
  userId: mongoose.Types.ObjectId;
  declarationId?: string;
  body: Record<string, unknown>;
}) {
  const run = await loadRun(params.companyId, params.processingRunId, params.declarationId);
  const review = await getHumanReviewCase(params.companyId, params.processingRunId, params.declarationId);
  const issueIdValue = typeof params.body.issueId === "string" ? params.body.issueId : "";
  const issue = review.issues.find(i => i.issueId === issueIdValue);
  if (!issue) throw new HttpError(400, "Review issue bulunamadı veya bu run'a ait değil.");

  const action = params.body.action;
  if (!Object.values(HumanReviewDecisionAction).includes(action as any)) throw new HttpError(400, "Geçersiz review action.");

  const candidateId = typeof params.body.candidateId === "string" ? params.body.candidateId : undefined;
  let value = params.body.value;
  let evidenceSnapshot: unknown = issue.evidence;

  if (action === HumanReviewDecisionAction.ACCEPT_CANDIDATE) {
    if (!candidateId) throw new HttpError(400, "ACCEPT_CANDIDATE için candidateId gerekli.");
    const candidate = issue.candidates.find(c => c.candidateId === candidateId);
    if (!candidate) throw new HttpError(400, "candidateId bu review issue için izin verilen adaylardan biri değil.");
    value = candidate.value;
    evidenceSnapshot = candidate.evidence;
  }

  if (action === HumanReviewDecisionAction.OVERRIDE_VALUE && value === undefined) {
    throw new HttpError(400, "OVERRIDE_VALUE için value gerekli.");
  }

  if (action === HumanReviewDecisionAction.CONFIRM_VALUE && value === undefined) {
    throw new HttpError(400, "CONFIRM_VALUE için value gerekli.");
  }

  return HumanReviewDecisionModel.create({
    companyId: params.companyId,
    processingRunId: run._id,
    declarationId: run.declarationId,
    uploadedFileId: run.uploadedFileId,
    issueId: issue.issueId,
    field: issue.field,
    rowIndex: issue.rowIndex,
    action,
    candidateId,
    value,
    evidenceSnapshot,
    reason: typeof params.body.reason === "string" ? params.body.reason : undefined,
    decidedBy: params.userId
  });
}
