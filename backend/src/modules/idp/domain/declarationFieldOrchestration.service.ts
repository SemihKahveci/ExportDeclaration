import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { CrossDocumentFieldRule } from "./crossDocumentFieldResolution.types.js";
import type { SourceFieldCandidates } from "./declarationFieldCandidateProjector.js";
import { projectDeclarationFieldCandidates } from "./declarationFieldCandidateProjector.js";
import { loadDeclarationDocumentSet } from "./declarationDocumentSet.service.js";
import { resolveAndPersistDeclarationFields } from "./declarationFieldResolution.service.js";
import { promotePersistedDeclarationFieldResolution } from "./declarationFieldPromotion.service.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function orchestrationKey(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  documents: unknown;
  sources: SourceFieldCandidates[];
  rules: CrossDocumentFieldRule[];
}): string {
  const payload = JSON.stringify(canonicalize({
    companyId: String(params.companyId),
    declarationId: String(params.declarationId),
    documents: params.documents,
    sources: params.sources,
    rules: params.rules
  }));
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Production boundary for Foundation 6 declaration-wide resolution.
 * A single call loads the persisted logical-document set, validates it, projects
 * file candidates onto logical documents, persists the resolution audit run and
 * promotes only RESOLVED fields. The deterministic orchestration key makes an
 * exact retry idempotent without allowing an old retry to replace a newer run.
 */
export async function orchestrateDeclarationFieldResolution(params: {
  companyId: mongoose.Types.ObjectId;
  declarationId: mongoose.Types.ObjectId;
  sources: SourceFieldCandidates[];
  rules?: CrossDocumentFieldRule[];
}) {
  const loaded = await loadDeclarationDocumentSet({
    companyId: params.companyId,
    declarationId: params.declarationId
  });
  if (!loaded.integrity.valid) {
    const codes = [...new Set(loaded.integrity.issues.map((issue) => issue.code))].sort().join(",");
    throw new Error(`Declaration document set integrity failed: ${codes}`);
  }

  const candidates = projectDeclarationFieldCandidates({
    documentSet: loaded.documentSet,
    sources: params.sources
  });
  const rules = params.rules ?? [];
  const key = orchestrationKey({
    companyId: params.companyId,
    declarationId: params.declarationId,
    documents: loaded.documentSet.documents,
    sources: params.sources,
    rules
  });

  const persisted = await resolveAndPersistDeclarationFields({
    companyId: params.companyId,
    declarationId: params.declarationId,
    candidates,
    rules,
    orchestrationKey: key
  });

  const promotion = await promotePersistedDeclarationFieldResolution({
    companyId: params.companyId,
    declarationId: params.declarationId,
    resolutionRunId: persisted.run._id
  });

  return {
    orchestrationKey: key,
    reusedResolutionRun: persisted.reused,
    documentSet: loaded.documentSet,
    candidates,
    resolutionRunId: String(persisted.run._id),
    resolution: persisted.resolution,
    promotion
  };
}
