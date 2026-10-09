/**
 * The LLM port: the one shape every model adapter has. Plain data in, plain
 * data out, so the pipeline can run against a real provider or a scripted
 * fake without knowing which.
 */

export type LLMProvider = "anthropic" | "gemini" | "fake";

/** The effort levels every Claude model with an effort setting accepts. */
export type Effort = "low" | "medium" | "high";

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  /**
   * Ask the provider for a JSON object (Gemini: application/json).
   * The Claude API has no schema-free JSON mode: there the prompt asks for JSON and
   * the caller's validate-and-repair loop does the rest.
   */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /**
   * How much the model may think (Claude's output_config.effort). Sent only to a
   * Claude model that accepts it (see claudeAcceptsEffort); Claude Haiku 4.5 and
   * the other providers' adapters ignore it.
   */
  effort?: Effort;
  /** Cancels the call (the client went away, or the run hit its deadline). */
  signal?: AbortSignal;
  /** Per-call timeout; the adapter's default applies when absent. */
  timeoutMs?: number;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  text: string;
  usage: LLMUsage;
  /** The model that answered, as the provider reports it. */
  model: string;
  /** Provider finish reason, e.g. "STOP", "MAX_TOKENS", "stop", "BLOCKED:SAFETY". */
  finishReason: string | null;
}

export interface LLM {
  readonly provider: LLMProvider;
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

/**
 * What went wrong, in terms the pipeline can act on:
 * - fatal for the whole run: auth, model-not-found, quota, bad-request
 * - retried with backoff: rate-limit (429 that is not a daily quota), server (5xx)
 * - recorded per call: timeout, network, bad-response
 * - aborted: the caller cancelled
 */
export type LLMErrorKind =
  | "auth"
  | "model-not-found"
  | "rate-limit"
  | "quota"
  | "server"
  | "bad-request"
  | "network"
  | "timeout"
  | "bad-response"
  | "aborted";

export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly provider: LLMProvider;
  /** HTTP status when the provider answered; null for network failures. */
  readonly status: number | null;
  /** How long the provider asked us to wait, when it said. */
  readonly retryAfterMs: number | null;
  /** Tokens the provider billed for a call that still failed (for example a reply cut off at max_tokens). */
  readonly usage: LLMUsage | null;

  constructor(
    kind: LLMErrorKind,
    message: string,
    opts: { provider: LLMProvider; status?: number | null; retryAfterMs?: number | null; usage?: LLMUsage | null },
  ) {
    super(message);
    this.name = "LLMError";
    this.kind = kind;
    this.provider = opts.provider;
    this.status = opts.status ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
    this.usage = opts.usage ?? null;
  }
}

/** The reply stopped at the output limit (Gemini MAX_TOKENS, Claude max_tokens) or a full context window. */
export const isCutOff = (finishReason: string | null): boolean =>
  /^(MAX_TOKENS|length|max_tokens|model_context_window_exceeded)$/i.test(finishReason ?? "");

/** The model declined to answer (a Claude refusal, a Gemini block): retrying with that turn in the history only repeats it. */
export const isRefusal = (finishReason: string | null): boolean => /^(refusal|BLOCKED)(:|$)/i.test(finishReason ?? "");

export const isRetryable = (e: unknown): e is LLMError =>
  e instanceof LLMError && (e.kind === "rate-limit" || e.kind === "server");

/** Errors after which no further call can succeed: stop the run. */
export const isFatal = (e: unknown): e is LLMError =>
  e instanceof LLMError && (e.kind === "auth" || e.kind === "model-not-found" || e.kind === "quota" || e.kind === "bad-request");

export const ERROR_HINT: Record<LLMErrorKind, string> = {
  auth: "The model key was rejected or lacks permission. Check ANTHROPIC_API_KEY (or GEMINI_API_KEY) in the environment.",
  "model-not-found": "The configured model id does not exist for this key. Check DIABLO_REASONING_MODEL and DIABLO_TARGET_MODEL.",
  "rate-limit": "The provider is rate-limiting this key. Wait a minute and try again.",
  quota: "The key's quota, spend limit or credit is used up (for example a monthly spend cap or a free tier's daily limit). Raise the limit, wait for it to reset or use another key.",
  server: "The provider had a server error. Try again shortly.",
  "bad-request": "The provider refused the request as malformed.",
  network: "The provider could not be reached.",
  timeout: "A model call took too long and was stopped.",
  "bad-response": "The provider answered with something that could not be read.",
  aborted: "The run was cancelled.",
};
