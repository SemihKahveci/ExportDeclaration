import type { LlmProvider } from "../domain/llmResolve.types.js";
import { QwenOpenAiProvider } from "./qwenOpenAiProvider.js";

export function createLlmProvider(): LlmProvider {
  return new QwenOpenAiProvider();
}
