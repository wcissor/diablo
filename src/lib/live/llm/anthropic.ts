import "server-only";
import { DEFAULT_RETRY, isObject, postJson, retryAfterHeader, safeMessage, sleep, withRetries, type Fetch, type RetryPolicy, type Sleep } from "./http";
import { claudeAcceptsEffort } from "../providers";
import { LLMError, type LLM, type LLMRequest, type LLMResponse, type LLMUsage } from "./types";

/**
 * Claude API adapter: the Messages API over plain fetch, like the other
 * adapters, so timeouts, retries and error kinds stay the engine's own.
 * Written against the Claude API docs as read on 9 Oct 2026 (Messages,
 * errors, rate limits, authentication). Not yet called against the real API.
 *
 * POST https://api.anthropic.com/v1/messages
 * - Headers: x-api-key (the key, never in the URL), anthropic-version
 *   2023-06-01, content-type application/json, and anthropic-workspace-id
 *   when the key is not scoped to a single workspace.
 * - Body: model, max_tokens (required), system as a top-level string (there
 *   is no system role among the messages), messages (user | assistant), and
 *   temperature only when the caller sets one (the API's range is 0 to 1).
 * - No thinking field: Claude Opus 5.5 always thinks (adaptive, default effort
 *   "medium"); Claude Haiku 4.5 does not think unless asked. Either way the
 *   thinking counts toward max_tokens and is billed as output.
 * - output_config.effort only when the caller sets one and the model takes it
 *   (claudeAcceptsEffort: Claude Opus 5.5 yes, Claude Haiku 4.5 no).
 * - JSON: the Claude API has no schema-free JSON mode and current models
 *   refuse an assistant prefill, so `json` changes nothing here; the prompt
 *   asks for one JSON object and the caller validates and repairs.
 * - The answer is the text blocks joined; thinking and redacted_thinking
 *   blocks are not the answer. A reply stopped by max_tokens (or a full
 *   context window) comes back as an answer with that finish reason, like the
 *   Gemini adapter's MAX_TOKENS and length: the callers decide (the
 *   draft loop asks for a shorter reply, the runner leaves out an empty one).
 */
export const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";
/** max_tokens is required by the API; used only when the caller sets none. */
export const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  /** For a key that is not scoped to one workspace (sent as anthropic-workspace-id). */
  workspaceId?: string | null;
  fetch?: Fetch;
  retry?: RetryPolicy;
  sleep?: Sleep;
  /** Default per-call timeout (ms). */
  timeoutMs?: number;
}

export function anthropicHeaders(apiKey: string, workspaceId?: string | null): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
  };
}

export function anthropicRequestBody(model: string, req: LLMRequest) {
  return {
    model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(req.temperature !== undefined ? { temperature: Math.min(1, Math.max(0, req.temperature)) } : {}),
    ...(req.effort && claudeAcceptsEffort(model) ? { output_config: { effort: req.effort } } : {}),
  };
}

export function anthropicLLM(opts: AnthropicOptions): LLM {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const headers = anthropicHeaders(opts.apiKey, opts.workspaceId);
  const attempt = async (req: LLMRequest): Promise<LLMResponse> => {
    const body = anthropicRequestBody(opts.model, req);
    const { status, json, headers: res } = await postJson(
      fetchImpl,
      `${ANTHROPIC_BASE}/messages`,
      { headers, body },
      { provider: "anthropic", timeoutMs: req.timeoutMs ?? opts.timeoutMs ?? 60_000, signal: req.signal, secret: opts.apiKey },
    );
    if (status < 200 || status >= 300) {
      throw classifyAnthropicError(status, json, res.get("retry-after"), opts.apiKey, res.get("request-id"));
    }
    return parseAnthropicResponse(json, opts.model);
  };
  return {
    provider: "anthropic",
    model: opts.model,
    complete: (req) => withRetries(() => attempt(req), { policy: opts.retry ?? DEFAULT_RETRY, wait: opts.sleep ?? sleep, signal: req.signal }),
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * usage → the engine's two counters. Input is input_tokens plus the cache
 * fields (the docs' total input); this engine sends no cache_control, so the
 * cache fields stay 0 in practice. output_tokens already includes thinking.
 */
export function anthropicUsage(value: unknown): LLMUsage {
  const u = isObject(value) ? value : {};
  return {
    inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
    outputTokens: num(u.output_tokens),
  };
}

export function parseAnthropicResponse(json: unknown, model: string): LLMResponse {
  if (!isObject(json)) throw new LLMError("bad-response", "The answer was not JSON.", { provider: "anthropic" });
  const usage = anthropicUsage(json.usage);
  if (!Array.isArray(json.content)) throw new LLMError("bad-response", "The answer had no content blocks.", { provider: "anthropic", usage });
  const answeredBy = typeof json.model === "string" && json.model ? json.model : model;
  const stop = typeof json.stop_reason === "string" ? json.stop_reason : null;
  // Only text blocks are the answer; thinking and redacted_thinking (and any other block type) are not.
  const text = json.content
    .filter((b): b is Record<string, unknown> => isObject(b) && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  let finishReason = stop;
  if (stop === "refusal") {
    // The model declined (a safety classifier stopped it): an answer that says no, not a broken response.
    const details = isObject(json.stop_details) ? json.stop_details : {};
    finishReason = typeof details.category === "string" && details.category ? `refusal:${details.category}` : "refusal";
  }
  return { text, usage, model: answeredBy, finishReason };
}

/**
 * Claude API errors: { type: "error", error: { type, message, details? }, request_id }.
 * 401 authentication_error and 403 permission_error → auth; 402 billing_error
 * and spend limits (429 with error.details.error_code
 * "enforced_spend_limit_reached", which carries no retry-after, or a 400 for a
 * limit you set) → quota; 404 not_found_error → model-not-found; 429
 * rate_limit_error → rate-limit with retry-after (seconds); 500 api_error,
 * 504 timeout_error, 529 overloaded_error and any other 5xx → server; 400
 * invalid_request_error, 413 request_too_large and the rest → bad-request.
 */
export function classifyAnthropicError(status: number, json: unknown, retryAfter: string | null, apiKey: string, requestIdHeader: string | null = null): LLMError {
  const err = isObject(json) && isObject(json.error) ? json.error : {};
  const type = typeof err.type === "string" ? err.type : "";
  const raw = typeof err.message === "string" ? err.message : isObject(json) && typeof json.__raw === "string" ? json.__raw : "";
  const message = safeMessage(raw, apiKey);
  const details = isObject(err.details) ? err.details : {};
  const code = typeof details.error_code === "string" ? details.error_code : "";
  const idCandidate = requestIdHeader ?? (isObject(json) && typeof json.request_id === "string" ? json.request_id : "");
  const requestId = /^req_[A-Za-z0-9]{1,64}$/.test(idCandidate) ? idCandidate : null;
  const base = { provider: "anthropic" as const, status };
  const say = (what: string) => `Claude API ${status}${type ? ` ${safeMessage(type, apiKey, 40)}` : ""}${requestId ? ` (${requestId})` : ""}: ${message || what}`;

  if (status === 401 || type === "authentication_error") return new LLMError("auth", say("the key was rejected"), base);
  if (status === 402 || type === "billing_error") return new LLMError("quota", say("billing problem: check the account's credit"), base);
  if (code === "enforced_spend_limit_reached" || (status === 400 && /reached your specified (?:workspace )?API usage limits/i.test(raw))) {
    return new LLMError("quota", say("spend limit reached"), base);
  }
  if (status === 403 || type === "permission_error") return new LLMError("auth", say("this key may not use that resource"), base);
  if (status === 404 || type === "not_found_error") {
    // A wrong ANTHROPIC_WORKSPACE_ID is a 404 too ("Workspace `…` not found."): a credentials problem, not a model one.
    return /workspace/i.test(raw) ? new LLMError("auth", say("workspace not found"), base) : new LLMError("model-not-found", say("model not found"), base);
  }
  if (status === 429 || type === "rate_limit_error") {
    return new LLMError("rate-limit", say("rate limited"), { ...base, retryAfterMs: retryAfterHeader(retryAfter) });
  }
  if (status >= 500 || type === "overloaded_error" || type === "api_error") {
    return new LLMError("server", say(status === 529 ? "overloaded" : "server error"), { ...base, retryAfterMs: retryAfterHeader(retryAfter) });
  }
  return new LLMError("bad-request", say("request refused"), base);
}
