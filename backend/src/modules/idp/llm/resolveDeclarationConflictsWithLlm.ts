import type { DeclarationLlmAssistRequest, DeclarationLlmAssistResponse } from "../domain/declarationLlmAssist.types.js";
import { validateDeclarationLlmAssistResponse } from "./declarationLlmAssistPolicy.js";

export interface DeclarationLlmAssistProvider {
  readonly name: string;
  resolveDeclarationConflicts(request: DeclarationLlmAssistRequest): Promise<DeclarationLlmAssistResponse>;
}

export async function resolveDeclarationConflictsWithLlm(input: {
  request: DeclarationLlmAssistRequest;
  provider: DeclarationLlmAssistProvider;
}): Promise<DeclarationLlmAssistResponse> {
  const response = await input.provider.resolveDeclarationConflicts(input.request);
  return validateDeclarationLlmAssistResponse(input.request, response);
}
