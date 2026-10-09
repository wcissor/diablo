import "server-only";
import { anthropicWorkspace, providerKey, type LiveConfig } from "../env";
import type { ProviderId } from "../types";
import { anthropicLLM } from "./anthropic";
import { geminiLLM } from "./gemini";
import type { LLM } from "./types";

type Make = (opts: { apiKey: string; model: string; timeoutMs: number }) => LLM;

const ADAPTERS: Record<ProviderId, Make> = {
  anthropic: (opts) => anthropicLLM({ ...opts, workspaceId: anthropicWorkspace() }),
  gemini: geminiLLM,
};

/**
 * The reasoning model (plans, interprets) and the target model (plays the
 * "Helper" system under test), from the configured provider. Null when no
 * provider is configured: the caller answers 503, nothing is faked.
 */
export function createModels(config: LiveConfig): { reasoning: LLM; target: LLM } | null {
  if (!config.provider) return null;
  const apiKey = providerKey(config.provider);
  if (!apiKey) return null;
  const make = ADAPTERS[config.provider];
  return {
    reasoning: make({ apiKey, model: config.reasoningModel, timeoutMs: config.caps.reasoningTimeoutMs }),
    target: make({ apiKey, model: config.targetModel, timeoutMs: config.caps.targetTimeoutMs }),
  };
}
