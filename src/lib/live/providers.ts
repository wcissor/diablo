import type { ProviderId } from "./types";

/**
 * Default models per provider. Claude ids were checked against the Claude
 * models overview and model deprecations pages on 9 Oct 2026; the Gemini
 * defaults against Google's model list the same day (both have a free tier).
 *
 * Claude: Claude Opus 5.5 plans and interprets. The system under test is
 * Claude Haiku 4.5, not Claude Haiku 5.5: the live scenario varies the
 * target's temperature (0.2 vs 1.0), and Claude Opus 4.7 and every later
 * Claude model, Haiku 5.5 included, answer a temperature other than 1 with a
 * 400 error. Haiku 4.5 still takes temperature 0 to 1 (see below).
 *
 * Claude Haiku 4.5 is the one legacy model here, and it has the nearest date
 * of any active Claude model: the deprecations table (read 9 Oct 2026) lists
 * claude-haiku-4-5-20251001 as Active, retirement "Not sooner than October 15,
 * 2026". Past that date Anthropic may deprecate it, with at least 60 days'
 * notice before retirement. The fallback target that still takes temperature
 * 0 to 1 and has a later commitment is claude-sonnet-4-6 (not sooner than
 * 17 Feb 2027; $3 / $15 per MTok): set DIABLO_TARGET_MODEL=claude-sonnet-4-6.
 * Moving the target to Claude Haiku 5.5 or Opus 5.5 needs a scenario whose
 * second factor is not temperature.
 */
export const DEFAULT_MODELS: Record<ProviderId, { reasoning: string; target: string }> = {
  anthropic: { reasoning: "claude-opus-5-5", target: "claude-haiku-4-5" },
  gemini: { reasoning: "gemini-3.8-flash", target: "gemini-3.5-flash-lite" },
};

export const PROVIDER_LABEL: Record<ProviderId, string> = { anthropic: "Claude API", gemini: "Gemini API" };

export const KEY_VAR: Record<ProviderId, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" };

/** Which key wins when several are set and DIABLO_LLM does not choose: Claude first (the team's choice), then Gemini. */
export const PROVIDER_ORDER: readonly ProviderId[] = ["anthropic", "gemini"];

export const isProviderId = (v: string): v is ProviderId => (PROVIDER_ORDER as readonly string[]).includes(v);

/**
 * True for a Claude model that answers a temperature other than its default
 * (1) with a 400 error. The model deprecations page (read 9 Oct 2026):
 * temperature, top_p and top_k "return a 400 error when set to a non-default
 * value on Claude 4.7 and later models and Claude Mythos Preview". Claude
 * Haiku 4.5, Sonnet 4.6 and Opus 4.6 still accept 0 to 1. An id this does not
 * recognise is assumed to accept it, and the API has the last word.
 */
export function claudeRejectsTemperature(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (id.startsWith("claude-mythos")) return true;
  const m = /^claude-(?:opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = m[2] === undefined ? 0 : Number(m[2]);
  return major > 4 || (major === 4 && minor >= 7);
}

/**
 * True for a Claude model that takes output_config.effort. The effort page's
 * supported models (read 9 Oct 2026): every Fable and Mythos model, Opus 4.5
 * and later, Sonnet 4.6 and later, Haiku 5.5 and later. Claude Haiku 4.5 is
 * not among them and rejects the field. An id this does not recognise is
 * assumed not to take it: leaving effort out is always a valid request.
 */
export function claudeAcceptsEffort(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (/^claude-(?:fable|mythos)-/.test(id)) return true;
  const m = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
  if (!m) return false;
  const version = Number(m[2]) + (m[3] === undefined ? 0 : Number(m[3]) / 100);
  const from = { opus: 4.05, sonnet: 4.06, haiku: 5 }[m[1] as "opus" | "sonnet" | "haiku"];
  return version >= from;
}
