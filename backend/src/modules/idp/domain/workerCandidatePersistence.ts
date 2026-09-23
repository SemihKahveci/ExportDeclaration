import type { CandidateExtractionEnvelope } from "./candidateExtraction.types.js";
import { buildProcessingRunCandidateSnapshot } from "./processingRunCandidateSnapshot.js";
import type { ProcessingRunDoc } from "./processingRun.model.js";

/** Shared production/test boundary: persist the exact worker extraction contract.
 * Validate/flatten BEFORE changing either Mixed field, so malformed extraction
 * cannot leave a partially updated candidate snapshot in the run.
 */
export async function persistWorkerCandidateExtraction(
  run: ProcessingRunDoc,
  extraction: CandidateExtractionEnvelope
): Promise<void> {
  const snapshot = buildProcessingRunCandidateSnapshot(extraction);
  run.candidates = extraction;
  run.declarationCandidates = snapshot;
  run.markModified("candidates");
  run.markModified("declarationCandidates");
  await run.save();
}
