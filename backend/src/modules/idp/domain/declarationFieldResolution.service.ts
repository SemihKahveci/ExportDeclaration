import mongoose from "mongoose";
import { DeclarationModel } from "../../declarations/declaration.model.js";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { DeclarationFieldCandidateEnvelope } from "./declarationFieldCandidate.types.js";
import { resolveDeclarationFields } from "./declarationFieldResolver.js";
import { DeclarationFieldResolutionRunModel } from "./declarationFieldResolution.model.js";

function assertEnvelopeScope(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  candidates: DeclarationFieldCandidateEnvelope;
}): void {
  if (params.candidates.companyId !== String(params.companyId)) throw new Error("Candidate envelope company scope mismatch.");
  if (params.candidates.declarationId !== String(params.declarationId)) throw new Error("Candidate envelope declaration scope mismatch.");
}

function collectSourceProcessingRunIds(candidates: DeclarationFieldCandidateEnvelope): string[] {
  const ids = new Set<string>();
  for (const fieldCandidates of Object.values(candidates.fields)) {
    for (const candidate of fieldCandidates) {
      if (candidate.sourceProcessingRunId) ids.add(candidate.sourceProcessingRunId);
    }
  }
  return [...ids].sort();
}

/**
 * Persists an append-only audit record for declaration-wide field resolution and
 * atomically points the declaration at the latest successful resolution snapshot.
 * The complete candidate/evidence envelope is retained so a resolved scalar can
 * always be traced back to its logical document, physical file and ProcessingRun.
 */
export async function resolveAndPersistDeclarationFields(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  candidates: DeclarationFieldCandidateEnvelope;
  rules?: CrossDocumentFieldRule[];
  orchestrationKey?: string;
}) {
  assertEnvelopeScope(params);

  const declaration = await DeclarationModel.findOne({ _id: params.declarationId, companyId: params.companyId });
  if (!declaration) throw new Error("Declaration not found in company scope.");

  if (params.orchestrationKey) {
    const existingRun = await DeclarationFieldResolutionRunModel.findOne({
      companyId: params.companyId,
      declarationId: params.declarationId,
      orchestrationKey: params.orchestrationKey
    });
    if (existingRun) {
      if (String(declaration.idpResolution?.resolutionRunId ?? "") !== String(existingRun._id)) {
        throw new Error("Stale orchestration replay cannot replace the declaration's current resolution run.");
      }
      return { run: existingRun, resolution: existingRun.resolution, reused: true as const };
    }
  }

  const resolution = resolveDeclarationFields({ candidates: params.candidates, rules: params.rules });
  const sourceProcessingRunIds = collectSourceProcessingRunIds(params.candidates);

  const run = await DeclarationFieldResolutionRunModel.create({
    companyId: params.companyId,
    declarationId: params.declarationId,
    candidateEnvelope: params.candidates,
    rules: params.rules ?? [],
    resolution,
    sourceProcessingRunIds,
    orchestrationKey: params.orchestrationKey
  });

  const updated = await DeclarationModel.updateOne(
    { _id: params.declarationId, companyId: params.companyId },
    {
      $set: {
        idpResolution: {
          version: "1",
          resolutionRunId: run._id,
          reviewRequiredFields: resolution.reviewRequiredFields,
          fields: resolution.fields,
          resolvedAt: run.createdAt
        }
      }
    }
  );

  if (updated.matchedCount !== 1) {
    await DeclarationFieldResolutionRunModel.deleteOne({ _id: run._id });
    throw new Error("Declaration disappeared before resolution snapshot could be persisted.");
  }

  return { run, resolution, reused: false as const };
}
