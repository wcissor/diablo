import "server-only";
import { CAP_LIMITS, maxCalls, MIN_ITEMS_PER_ARM, type LiveCaps } from "./budget";
import { claudeRejectsTemperature, DEFAULT_MODELS, isProviderId, KEY_VAR, PROVIDER_LABEL, PROVIDER_ORDER } from "./providers";
import type { AbuseLimits, LivePublicConfig, ProviderId } from "./types";

/**
 * The one place the live engine reads the environment. Read at request time,
 * so `next build` needs no keys, and keys never leave this module except into
 * an adapter's request header.
 *
 *   ANTHROPIC_API_KEY         Claude API key (Claude Console → Settings → API keys)
 *   ANTHROPIC_WORKSPACE_ID    only for a key not scoped to one workspace: sent as anthropic-workspace-id
 *   GEMINI_API_KEY            Google AI Studio key (free tier, no card)
 *   ZAI_API_KEY               Z.ai key (GLM)
 *   DIABLO_LLM                anthropic | gemini | zai; else whichever key exists (Claude, then Gemini, then Z.ai)
 *   DIABLO_REASONING_MODEL    plans and interprets (default per provider in providers.ts)
 *   DIABLO_TARGET_MODEL       the "Helper" system under test (default per provider in providers.ts)
 *   LIVE_MAX_EXPERIMENTS, LIVE_MAX_ITEMS_PER_ARM, LIVE_CONCURRENCY,
 *   LIVE_TARGET_TIMEOUT_SECONDS, LIVE_REASONING_TIMEOUT_SECONDS,
 *   LIVE_RUN_DEADLINE_SECONDS  budget overrides, clamped to hard ceilings
 *   LIVE_DAILY_CALL_CAP, LIVE_COOLDOWN_SECONDS, LIVE_MAX_CONCURRENT_RUNS  abuse controls
 */

export interface LiveConfig {
  provider: ProviderId | null;
  /** What is misconfigured (a key named by DIABLO_LLM is missing, an odd model id); null when simply no key is set. */
  problem: string | null;
  reasoningModel: string;
  targetModel: string;
  caps: LiveCaps;
  limits: AbuseLimits;
}

type Env = Record<string, string | undefined>;

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function intEnv(env: Env, name: string, def: number, min: number, max: number, scale = 1): number {
  const raw = env[name]?.trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n * scale)));
}

export function readCaps(env: Env): LiveCaps {
  const L = CAP_LIMITS;
  return {
    maxExperiments: intEnv(env, "LIVE_MAX_EXPERIMENTS", L.maxExperiments.def, L.maxExperiments.min, L.maxExperiments.max),
    maxItemsPerArm: intEnv(env, "LIVE_MAX_ITEMS_PER_ARM", L.maxItemsPerArm.def, L.maxItemsPerArm.min, L.maxItemsPerArm.max),
    minItemsPerArm: MIN_ITEMS_PER_ARM,
    concurrency: intEnv(env, "LIVE_CONCURRENCY", L.concurrency.def, L.concurrency.min, L.concurrency.max),
    targetTimeoutMs: intEnv(env, "LIVE_TARGET_TIMEOUT_SECONDS", L.targetTimeoutMs.def, L.targetTimeoutMs.min, L.targetTimeoutMs.max, 1000),
    reasoningTimeoutMs: intEnv(
      env,
      "LIVE_REASONING_TIMEOUT_SECONDS",
      L.reasoningTimeoutMs.def,
      L.reasoningTimeoutMs.min,
      L.reasoningTimeoutMs.max,
      1000,
    ),
    runDeadlineMs: intEnv(env, "LIVE_RUN_DEADLINE_SECONDS", L.runDeadlineMs.def, L.runDeadlineMs.min, L.runDeadlineMs.max, 1000),
  };
}

export function readLimits(env: Env): AbuseLimits {
  return {
    dailyCallCap: intEnv(env, "LIVE_DAILY_CALL_CAP", 500, 0, 100_000),
    cooldownMs: intEnv(env, "LIVE_COOLDOWN_SECONDS", 60_000, 0, 3_600_000, 1000),
    maxConcurrentRuns: intEnv(env, "LIVE_MAX_CONCURRENT_RUNS", 2, 1, 4),
  };
}

function pickProvider(env: Env): { provider: ProviderId | null; problem: string | null } {
  const has = (p: ProviderId) => !!env[KEY_VAR[p]]?.trim();
  const wanted = env.DIABLO_LLM?.trim().toLowerCase();
  if (wanted) {
    if (!isProviderId(wanted)) {
      return { provider: null, problem: `DIABLO_LLM must be ${PROVIDER_ORDER.map((p) => `"${p}"`).join(", ")} (it is "${wanted.slice(0, 20)}").` };
    }
    return has(wanted) ? { provider: wanted, problem: null } : { provider: null, problem: `DIABLO_LLM is "${wanted}" but ${KEY_VAR[wanted]} is not set.` };
  }
  const first = PROVIDER_ORDER.find(has);
  // Simply no key: not a misconfiguration, so no problem to report beyond "not configured".
  return { provider: first ?? null, problem: null };
}

const WORKSPACE_ID = /^wrkspc_[A-Za-z0-9]{1,64}$/;

/** The live scenario varies the target's temperature; a Claude model that rejects any value but 1 cannot run it. */
function targetProblem(provider: ProviderId | null, target: string): string | null {
  if (provider !== "anthropic" || !claudeRejectsTemperature(target)) return null;
  return (
    `${target} accepts no temperature other than 1, and live studies set the target's temperature per arm. ` +
    `Set DIABLO_TARGET_MODEL to a Claude model that takes a temperature, such as ${DEFAULT_MODELS.anthropic.target} (the default).`
  );
}

function model(env: Env, name: string, fallback: string): string | { invalid: string } {
  const v = env[name]?.trim();
  if (!v) return fallback;
  return MODEL_ID.test(v) ? v : { invalid: name };
}

export function liveConfig(env: Env = process.env): LiveConfig {
  const caps = readCaps(env);
  const limits = readLimits(env);
  const { provider, problem } = pickProvider(env);
  const defaults = DEFAULT_MODELS[provider ?? PROVIDER_ORDER[0]];
  const reasoning = model(env, "DIABLO_REASONING_MODEL", defaults.reasoning);
  const target = model(env, "DIABLO_TARGET_MODEL", defaults.target);
  const bad = [reasoning, target].find((m): m is { invalid: string } => typeof m !== "string");
  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  const reasoningModel = typeof reasoning === "string" ? reasoning : defaults.reasoning;
  const targetModel = typeof target === "string" ? target : defaults.target;
  const found =
    (bad ? `${bad.invalid} is not a valid model id.` : null) ??
    (provider === "anthropic" && workspace && !WORKSPACE_ID.test(workspace) ? "ANTHROPIC_WORKSPACE_ID is not a workspace id (they look like wrkspc_…)." : null) ??
    targetProblem(provider, targetModel);
  return {
    provider: found ? null : provider,
    problem: found ?? problem,
    reasoningModel,
    targetModel,
    caps,
    limits,
  };
}

/** The workspace header value for a Claude key that is not scoped to one workspace; null when not set. */
export function anthropicWorkspace(env: Env = process.env): string | null {
  const v = env.ANTHROPIC_WORKSPACE_ID?.trim();
  return v && WORKSPACE_ID.test(v) ? v : null;
}

/** The key for a provider. Only the adapter factory calls this. */
export function providerKey(provider: ProviderId, env: Env = process.env): string | null {
  return env[KEY_VAR[provider]]?.trim() || null;
}

export function publicConfig(config: LiveConfig = liveConfig()): LivePublicConfig {
  const configured = config.provider !== null;
  return {
    configured,
    provider: config.provider,
    providerLabel: config.provider ? PROVIDER_LABEL[config.provider] : null,
    problem: config.problem,
    reasoningModel: configured ? config.reasoningModel : null,
    targetModel: configured ? config.targetModel : null,
    caps: config.caps,
    limits: config.limits,
    estimate: maxCalls(config.caps),
  };
}

