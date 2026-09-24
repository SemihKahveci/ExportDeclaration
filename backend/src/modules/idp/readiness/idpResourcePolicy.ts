export interface IdpResourcePolicyInput {
  workerConcurrency: number;
  pageCount: number;
  contentKind: "DIGITAL" | "SCANNED" | "MIXED";
  llmEnabled: boolean;
  llmTimeoutMs: number;
}
export interface IdpResourcePolicy {
  version: "1"; workerConcurrency: number; ocrRequired: boolean; ocrPageBudget: number;
  llmEnabled: boolean; llmTimeoutMs: number | null;
}
function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}
export function buildIdpResourcePolicy(input: IdpResourcePolicyInput): IdpResourcePolicy {
  const workerConcurrency = positiveInteger(input.workerConcurrency, "workerConcurrency");
  const pageCount = positiveInteger(input.pageCount, "pageCount");
  const ocrRequired = input.contentKind !== "DIGITAL";
  if (input.llmEnabled) positiveInteger(input.llmTimeoutMs, "llmTimeoutMs");
  return {
    version: "1", workerConcurrency, ocrRequired,
    ocrPageBudget: ocrRequired ? pageCount : 0,
    llmEnabled: input.llmEnabled,
    llmTimeoutMs: input.llmEnabled ? input.llmTimeoutMs : null
  };
}
