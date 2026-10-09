/**
 * RUN: the paired runner. Every experiment runs the same seeded items in both
 * arms; code calls the target, scores each reply and counts. Hard caps are
 * checked here again, whatever the plan says.
 *
 * - One call per (arm configuration, item): when two experiments share an arm
 *   (say both use the baseline as control), that arm's answers are reused.
 * - Calls are queued item by item, so if the deadline stops the run early the
 *   finished pairs are spread evenly over the experiments.
 * - A pair counts only when both of its calls were scored. A call that failed
 *   (timeout, network, unreadable answer) leaves its pair out; it is never
 *   scored as wrong. Fatal provider errors (bad key, unknown model, quota) stop
 *   the run at once.
 * - A rate limit that outlasts the adapter's own retries pauses the whole pool
 *   (as long as the provider asked, at most a minute) and puts the call back in
 *   the queue, up to three times. It is not a failure: on a free tier the run
 *   simply slows down, and the deadline decides how many pairs finish.
 */
import type { LiveCaps } from "./budget";
import { LiveError } from "./errors";
import { sleep } from "./llm/http";
import { isCutOff, isFatal, LLMError, type LLM, type LLMErrorKind, type LLMUsage } from "./llm/types";
import { armById, scoreCase, studyRequest, type Case, type Study } from "./study";
import type { PlannedExperiment, RunProgress } from "./types";

export interface CallOutcome {
  key: string;
  settings: string;
  item: Case;
  status: "scored" | "failed" | "cancelled";
  response: string;
  parsed: string | null;
  score: 0 | 1 | null;
  rationale: string | null;
  error: string | null;
  errorKind: LLMErrorKind | null;
  usage: LLMUsage;
  finishReason: string | null;
  model: string | null;
  durationMs: number;
}

export interface PairOutcome {
  item: Case;
  control: CallOutcome;
  treatment: CallOutcome;
}

export interface ExperimentOutcome {
  id: string;
  plannedPairs: number;
  /** Pairs where both arms were scored, in item order. */
  pairs: PairOutcome[];
  excludedPairs: number;
  counts: { control: { k: number; n: number }; treatment: { k: number; n: number } };
  /** b: control right, treatment wrong. c: control wrong, treatment right. */
  discordant: { b: number; c: number };
  /** Tokens of the calls this experiment used (a shared arm counts in each experiment that uses it). */
  tokens: number;
}

export interface RunOutcome {
  experiments: ExperimentOutcome[];
  calls: RunProgress;
  usage: LLMUsage;
  deadlineHit: boolean;
  startedAt: number;
  finishedAt: number;
  /** The model id the target reported. */
  model: string | null;
}

export interface RunOptions {
  target: LLM;
  study: Study;
  plan: PlannedExperiment[];
  items: Case[];
  caps: LiveCaps;
  signal?: AbortSignal;
  now?: () => number;
  onProgress?: (p: RunProgress, usage: LLMUsage) => void;
}

interface Task {
  key: string;
  settings: string;
  item: Case;
  /** Times this call went back in the queue after a rate limit. */
  requeues?: number;
}

export const MAX_REQUEUES = 3;
/** Pause when the provider rate-limits without saying for how long (ms); never longer than a minute. */
const DEFAULT_PAUSE_MS = 5000;
const MAX_PAUSE_MS = 60_000;

const callKey = (arm: string, item: Case) => `${arm}|${item.id}`;

/** The unique target calls a plan needs, in the order the runner makes them. */
export function scheduleCalls(plan: PlannedExperiment[], items: Case[]): Task[] {
  const maxN = Math.max(0, ...plan.map((e) => e.n));
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < maxN; i++) {
    for (const e of plan) {
      if (i >= e.n) continue;
      const item = items[i];
      for (const s of [e.control, e.treatment]) {
        const key = callKey(s, item);
        if (seen.has(key)) continue;
        seen.add(key);
        tasks.push({ key, settings: s, item });
      }
    }
  }
  return tasks;
}

/** Refuses any plan outside the caps, whoever produced it. */
export function assertWithinCaps(plan: PlannedExperiment[], items: Case[], caps: LiveCaps) {
  if (plan.length === 0 || plan.length > caps.maxExperiments) {
    throw new LiveError("budget", `A run may have 1 to ${caps.maxExperiments} experiments (this plan has ${plan.length}).`);
  }
  for (const e of plan) {
    if (!Number.isInteger(e.n) || e.n < caps.minItemsPerArm || e.n > caps.maxItemsPerArm) {
      throw new LiveError("budget", `${e.id} asks for ${e.n} items per arm; the limit is ${caps.minItemsPerArm} to ${caps.maxItemsPerArm}.`);
    }
    if (e.n > items.length) throw new LiveError("budget", `${e.id} asks for ${e.n} items but the dataset has ${items.length}.`);
  }
}

export async function runPaired({ target, study, plan, items, caps, signal, now = Date.now, onProgress }: RunOptions): Promise<RunOutcome> {
  assertWithinCaps(plan, items, caps);
  const tasks = scheduleCalls(plan, items);
  if (tasks.length > caps.maxExperiments * 2 * caps.maxItemsPerArm) throw new LiveError("budget", "The plan needs more calls than the budget allows.");

  const startedAt = now();
  const stop = new AbortController();
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error("deadline")), caps.runDeadlineMs);
  const callSignal = AbortSignal.any([stop.signal, deadline.signal, ...(signal ? [signal] : [])]);

  const results = new Map<string, CallOutcome>();
  const usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
  const progress: RunProgress = { done: 0, total: tasks.length, scored: 0, failed: 0, cancelled: 0 };
  const failureLimit = Math.max(5, Math.ceil(tasks.length * 0.25));
  let fatal: unknown = null;
  let reportedModel: string | null = null;

  const record = (o: CallOutcome) => {
    results.set(o.key, o);
    progress.done++;
    progress[o.status]++;
    onProgress?.({ ...progress }, { ...usage });
  };

  let pauseUntil = 0;
  const runTask = async (t: Task) => {
    const wait = pauseUntil - now();
    if (wait > 0) await sleep(wait, callSignal).catch(() => {});
    const base = { key: t.key, settings: t.settings, item: t.item, parsed: null, score: null, rationale: null, finishReason: null, model: null };
    const zero = { inputTokens: 0, outputTokens: 0 };
    if (callSignal.aborted) {
      record({ ...base, status: "cancelled", response: "", error: "Not run: the run stopped first.", errorKind: "aborted", usage: zero, durationMs: 0 });
      return;
    }
    const t0 = now();
    try {
      const res = await target.complete({ ...studyRequest(armById(study, t.settings), t.item), signal: callSignal, timeoutMs: caps.targetTimeoutMs });
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      reportedModel ??= res.model;
      // An empty reply cut off by the output limit is our budget's fault, not the target's: leave the pair out.
      if (!res.text.trim() && isCutOff(res.finishReason)) {
        throw new LLMError("bad-response", "The reply was cut off by the output limit before any answer.", { provider: target.provider });
      }
      const s = scoreCase(res.text, t.item.check);
      record({
        ...base,
        status: "scored",
        response: res.text,
        parsed: s.parsed,
        score: s.score,
        rationale: s.rationale,
        error: null,
        errorKind: null,
        usage: res.usage,
        finishReason: res.finishReason,
        model: res.model,
        durationMs: now() - t0,
      });
    } catch (e) {
      const kind: LLMErrorKind = e instanceof LLMError ? e.kind : "bad-response";
      const message = e instanceof Error ? e.message : "Unknown error";
      // A call can fail after the provider billed it (a reply cut off at max_tokens): those tokens count.
      const billed = e instanceof LLMError && e.usage ? e.usage : zero;
      usage.inputTokens += billed.inputTokens;
      usage.outputTokens += billed.outputTokens;
      const cancelled = kind === "aborted" || callSignal.aborted;
      if (kind === "rate-limit" && !cancelled && (t.requeues ?? 0) < MAX_REQUEUES) {
        const ms = Math.min(MAX_PAUSE_MS, (e as LLMError).retryAfterMs ?? DEFAULT_PAUSE_MS);
        pauseUntil = Math.max(pauseUntil, now() + ms);
        tasks.push({ ...t, requeues: (t.requeues ?? 0) + 1 });
        return;
      }
      record({ ...base, status: cancelled ? "cancelled" : "failed", response: "", error: message, errorKind: kind, usage: billed, durationMs: now() - t0 });
      if (isFatal(e)) {
        fatal ??= e;
        stop.abort(e);
      } else if (!cancelled && progress.failed >= failureLimit) {
        fatal ??= new LiveError("too-many-failures", `${progress.failed} target calls failed (the limit is ${failureLimit}); the run stopped. Last error: ${message}`);
        stop.abort(fatal);
      }
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const t = tasks[next++];
      await runTask(t);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(caps.concurrency, tasks.length) }, worker));
  } finally {
    clearTimeout(timer);
  }

  if (fatal) throw fatal;
  if (signal?.aborted) throw new LiveError("aborted", "The run was cancelled.");

  const experiments = plan.map((e): ExperimentOutcome => {
    const pairs: PairOutcome[] = [];
    let tokens = 0;
    for (const item of items.slice(0, e.n)) {
      const control = results.get(callKey(e.control, item));
      const treatment = results.get(callKey(e.treatment, item));
      for (const o of [control, treatment]) if (o) tokens += o.usage.inputTokens + o.usage.outputTokens;
      if (control?.status === "scored" && treatment?.status === "scored") pairs.push({ item, control, treatment });
    }
    const k = (arm: "control" | "treatment") => pairs.filter((p) => p[arm].score === 1).length;
    const b = pairs.filter((p) => p.control.score === 1 && p.treatment.score === 0).length;
    const c = pairs.filter((p) => p.control.score === 0 && p.treatment.score === 1).length;
    return {
      id: e.id,
      plannedPairs: e.n,
      pairs,
      excludedPairs: e.n - pairs.length,
      counts: { control: { k: k("control"), n: pairs.length }, treatment: { k: k("treatment"), n: pairs.length } },
      discordant: { b, c },
      tokens,
    };
  });

  return {
    experiments,
    calls: progress,
    usage,
    deadlineHit: deadline.signal.aborted,
    startedAt,
    finishedAt: now(),
    model: reportedModel,
  };
}
