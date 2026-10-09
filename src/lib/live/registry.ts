/**
 * The target registry: the AI system a live investigation studies, the
 * factors that may be varied, and their values. It is the closed vocabulary
 * the reasoning model's plan is validated against: an experiment can only
 * vary these factors and only choose these values.
 *
 * The scenario: "Helper" v2 shipped with TWO changes at once, a shortened
 * system prompt and a higher temperature. Which one moved accuracy, if
 * either, is not known in advance: the run measures it on a real model.
 */
import type { AISystem } from "@/lib/data/types";
import type { LLMRequest } from "./llm/types";
import type { Item } from "./dataset";

export const SYSTEM_PROMPTS = {
  full: [
    "You are Helper, a careful assistant for arithmetic questions.",
    "Work through the problem step by step and write down each intermediate result.",
    "Check every multiplication before you use its result.",
    'End your reply with a final line of the form "Answer: <integer>" and nothing else on that line.',
  ].join("\n"),
  short: "You are Helper. Be brief: reply with the final number only, with no working.",
} as const;

export type PromptVariant = keyof typeof SYSTEM_PROMPTS;

export const FACTORS = {
  system_prompt: {
    label: "System prompt",
    values: ["full", "short"] as const,
    valueLabel: { full: "Full: step by step, ends with an “Answer:” line", short: "Short: “the final number only, no working”" } as Record<string, string>,
  },
  temperature: {
    label: "Temperature",
    values: ["0.2", "1.0"] as const,
    valueLabel: { "0.2": "0.2", "1.0": "1.0" } as Record<string, string>,
  },
} as const;

export type FactorId = keyof typeof FACTORS;
export const FACTOR_IDS = Object.keys(FACTORS) as FactorId[];

export interface Settings {
  system_prompt: (typeof FACTORS.system_prompt.values)[number];
  temperature: (typeof FACTORS.temperature.values)[number];
}

export interface Version {
  id: "helper-v1" | "helper-v2";
  name: string;
  version: string;
  settings: Settings;
}

export const VERSIONS: Version[] = [
  { id: "helper-v1", name: "Helper v1", version: "v1", settings: { system_prompt: "full", temperature: "0.2" } },
  { id: "helper-v2", name: "Helper v2", version: "v2", settings: { system_prompt: "short", temperature: "1.0" } },
];

export const V1 = VERSIONS[0];
export const V2 = VERSIONS[1];

/** The question every live run starts from. It assumes no outcome. */
export const QUESTION =
  "Helper v2 shipped two changes at once: a shortened system prompt and a higher temperature (0.2 → 1.0). Did v2 change accuracy on multi-step arithmetic, and which change is responsible?";

export const TITLE = "Live: which Helper v2 change moved accuracy?";

/** Output room for one target answer (thinking, where the model thinks, included). */
export const TARGET_MAX_TOKENS = 2048;

export const sameSettings = (a: Settings, b: Settings) => FACTOR_IDS.every((f) => a[f] === b[f]);
export const settingsKey = (s: Settings) => FACTOR_IDS.map((f) => `${f}=${s[f]}`).join(";");
export const changedFactors = (a: Settings, b: Settings) => FACTOR_IDS.filter((f) => a[f] !== b[f]);

export function versionOf(s: Settings): Version | null {
  return VERSIONS.find((v) => sameSettings(v.settings, s)) ?? null;
}

/** "Helper v1", or a description such as "Short prompt, temperature 0.2". */
export function armLabel(s: Settings): string {
  const v = versionOf(s);
  if (v) return v.name;
  return `${s.system_prompt === "full" ? "Full" : "Short"} prompt, temperature ${s.temperature}`;
}

/** The arm config shown as a diff between arms in the workspace. */
export function armConfig(s: Settings, targetModel: string): Record<string, string> {
  return { model: targetModel, "system prompt": s.system_prompt, temperature: s.temperature };
}

/** The request one item sends to the target in one arm. Only registry factors change between arms. */
export function targetRequest(s: Settings, item: Item): LLMRequest {
  return {
    system: SYSTEM_PROMPTS[s.system_prompt],
    messages: [{ role: "user", content: item.prompt }],
    temperature: Number(s.temperature),
    maxTokens: TARGET_MAX_TOKENS,
  };
}

/** The two Helper versions as AI systems, so the workspace can name them. */
export function helperSystems(targetModel: string, family: string | null): AISystem[] {
  return VERSIONS.map((v) => ({
    id: v.id,
    name: v.name,
    product: "Helper",
    version: v.version,
    kind: "app",
    family,
    versionString: `${targetModel}, ${v.settings.system_prompt} prompt, temperature ${v.settings.temperature}`,
    description: `Arithmetic assistant on ${targetModel} with the ${v.settings.system_prompt} system prompt at temperature ${v.settings.temperature}.`,
  }));
}

/** The Helper versions as catalog entries when the target model is not known (the workspace's lookups). */
export const HELPER_CATALOG: AISystem[] = [
  {
    id: "live-target",
    name: "AI under test",
    product: "Live study",
    version: "live",
    kind: "model",
    family: null,
    versionString: null,
    description: "The model a live study ran on, configured per arm by the study's system prompt and temperature. Each run records the exact model.",
  },
  ...VERSIONS.map((v): AISystem => ({
  id: v.id,
  name: v.name,
  product: "Helper",
  version: v.version,
  kind: "app",
  family: null,
  // The model is recorded on each run; an arm that varies one factor is not exactly this version.
  versionString: null,
  description: `${v.name}: ${v.settings.system_prompt} system prompt, temperature ${v.settings.temperature}. A live experiment's arm settings show exactly what ran.`,
})),
];
