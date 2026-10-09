/**
 * Shapes shared by the live engine, its API and the page. Client-safe: no
 * secrets, no server imports.
 */
import type { Hypothesis, Investigation } from "@/lib/data/types";
import type { CallEstimate, LiveCaps } from "./budget";
import type { LLMErrorKind } from "./llm/types";
import type { Study } from "./study";

export type ProviderId = "anthropic" | "gemini";

export interface AbuseLimits {
  /** Model calls per UTC day across all users of one server instance. */
  dailyCallCap: number;
  /** Wait after a run before the same session may start another (ms). */
  cooldownMs: number;
  /** Live runs in flight at once on one server instance. */
  maxConcurrentRuns: number;
}

/** What the page may know about the server's setup: no keys, nothing secret. */
export interface LivePublicConfig {
  configured: boolean;
  provider: ProviderId | null;
  providerLabel: string | null;
  problem: string | null;
  reasoningModel: string | null;
  targetModel: string | null;
  caps: LiveCaps;
  limits: AbuseLimits;
  estimate: CallEstimate;
}

export type LiveStage = "draft" | "run" | "analyze" | "interpret";
export const STAGES: LiveStage[] = ["draft", "run", "analyze", "interpret"];

export interface Models {
  provider: ProviderId | "fake";
  reasoning: string;
  target: string;
}

export interface StageUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Usage extends StageUsage {
  byStage: Record<"draft" | "run" | "interpret", StageUsage>;
}

export interface PlannedExperiment {
  id: string;
  hypothesisId: string;
  title: string;
  rationale: string | null;
  /** Arm ids from the study. */
  control: string;
  treatment: string;
  /** Cases per arm (pairs). */
  n: number;
}

export interface Plan {
  study: Study;
  hypotheses: Hypothesis[];
  experiments: PlannedExperiment[];
}

export interface RunProgress {
  /** Unique target calls finished (scored, failed or cancelled). */
  done: number;
  /** Unique target calls planned. */
  total: number;
  scored: number;
  failed: number;
  cancelled: number;
}

/** One entry of the fact table: a value computed by code that the conclusion may cite as {{F1}}. */
export interface Fact {
  id: string;
  label: string;
  value: string;
}

export interface Conclusion {
  /** The text shown, numbers substituted from the fact table. */
  text: string;
  /** "model": written by the reasoning model and passed the number check. "template": built by code. */
  source: "model" | "template";
  /** The model's own text with placeholders, when it passed. */
  raw: string | null;
  attempts: number;
  /** Why each rejected attempt was rejected. */
  rejections: string[][];
  facts: Fact[];
}

export interface ExperimentRunSummary {
  id: string;
  plannedPairs: number;
  completedPairs: number;
  excludedPairs: number;
}

export interface LiveResult {
  investigation: Investigation;
  conclusion: Conclusion;
  plan: Plan;
  draftAttempts: number;
  run: {
    plannedCalls: number;
    scored: number;
    failed: number;
    cancelled: number;
    deadlineHit: boolean;
    durationMs: number;
    perExperiment: ExperimentRunSummary[];
  };
  usage: Usage;
  models: Models;
  /** The model id the target reported in its answers (may be more specific than the configured one). */
  targetReported: string | null;
  startedAt: string;
  finishedAt: string;
}

export type LiveErrorCode =
  | "not-configured"
  | "draft-invalid"
  | "provider"
  | "too-many-failures"
  | "no-pairs"
  | "aborted"
  | "budget"
  | "internal";

export type LiveEvent =
  | { type: "start"; at: string; models: Models; caps: LiveCaps; estimate: CallEstimate }
  | { type: "stage"; stage: LiveStage; state: "started" | "done"; at: string }
  | { type: "draft-attempt"; attempt: number; ok: boolean; problems: string[] }
  | { type: "plan"; plan: Plan; plannedCalls: number }
  | { type: "progress"; progress: RunProgress; usage: Usage }
  | { type: "interpret-attempt"; attempt: number; ok: boolean; problems: string[] }
  | { type: "result"; result: LiveResult }
  | { type: "error"; stage: LiveStage | null; code: LiveErrorCode; kind: LLMErrorKind | null; message: string };
