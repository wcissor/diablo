/**
 * A live investigation, end to end: DRAFT → RUN → ANALYZE → INTERPRET.
 *
 * "The AI reasons. The system measures." The reasoning model proposes the
 * plan and explains the result; code calls the target, scores, computes the
 * statistics and checks every number in the conclusion. Progress is emitted
 * as events so a page can follow along.
 */
import { analyze, buildInvestigation } from "./analyze";
import { maxCalls, type LiveCaps } from "./budget";
import { draftPlan } from "./draft";
import { LiveError } from "./errors";
import { interpret } from "./interpret";
import { LLMError, type LLM, type LLMRequest, type LLMUsage } from "./llm/types";
import { runPaired, scheduleCalls } from "./runner";
import type { LiveEvent, LiveResult, LiveStage, Models, Usage } from "./types";

export interface InvestigateOptions {
  reasoning: LLM;
  target: LLM;
  models: Models;
  caps: LiveCaps;
  /** Investigation id; must match the app's created-id shape (see src/lib/slug.ts). */
  id: string;
  emit?: (event: LiveEvent) => void;
  signal?: AbortSignal;
  now?: () => number;
  /** The meter to fill; pass one to read the calls made even when the run fails. */
  usage?: Usage;
  /** The researcher's question; the study is designed from it. */
  objective?: string;
}

/**
 * Everything must finish inside the route's maxDuration (300 s). The run
 * stage's deadline is cut short when planning took long, leaving room to
 * interpret; interpretation calls get at most half of what is left.
 */
export const TOTAL_BUDGET_MS = 285_000;
const INTERPRET_RESERVE_MS = 45_000;

const emptyStage = () => ({ calls: 0, inputTokens: 0, outputTokens: 0 });

export function emptyUsage(): Usage {
  return { ...emptyStage(), byStage: { draft: emptyStage(), run: emptyStage(), interpret: emptyStage() } };
}

/** Counts every call a stage makes (successful or not) and the tokens it used, including those a failed call was billed for. */
function metered(llm: LLM, usage: Usage, stage: keyof Usage["byStage"]): LLM {
  const add = (used: LLMUsage) => {
    for (const u of [usage, usage.byStage[stage]]) {
      u.inputTokens += used.inputTokens;
      u.outputTokens += used.outputTokens;
    }
  };
  return {
    provider: llm.provider,
    model: llm.model,
    async complete(req: LLMRequest) {
      usage.calls++;
      usage.byStage[stage].calls++;
      try {
        const res = await llm.complete(req);
        add(res.usage);
        return res;
      } catch (e) {
        if (e instanceof LLMError && e.usage) add(e.usage);
        throw e;
      }
    },
  };
}

export async function investigate(opts: InvestigateOptions): Promise<LiveResult> {
  const now = opts.now ?? Date.now;
  const emit = opts.emit ?? (() => {});
  const iso = () => new Date(now()).toISOString();
  const usage = opts.usage ?? emptyUsage();
  const reasoningDraft = metered(opts.reasoning, usage, "draft");
  const reasoningInterpret = metered(opts.reasoning, usage, "interpret");
  const target = metered(opts.target, usage, "run");
  const startedAt = now();
  const remaining = () => startedAt + TOTAL_BUDGET_MS - now();
  let stage: LiveStage | null = null;
  const enter = (s: LiveStage) => {
    stage = s;
    emit({ type: "stage", stage: s, state: "started", at: iso() });
  };
  const leave = (s: LiveStage) => emit({ type: "stage", stage: s, state: "done", at: iso() });

  emit({ type: "start", at: iso(), models: opts.models, caps: opts.caps, estimate: maxCalls(opts.caps) });
  try {
    enter("draft");
    const { plan, attempts } = await draftPlan({
      llm: reasoningDraft,
      caps: opts.caps,
      target: opts.models.target,
      signal: opts.signal,
      objective: opts.objective,
      onAttempt: (attempt, ok, problems) => emit({ type: "draft-attempt", attempt, ok, problems }),
    });
    const planned = now();
    const items = plan.study.cases;
    emit({ type: "plan", plan, plannedCalls: scheduleCalls(plan.experiments, items).length });
    leave("draft");

    enter("run");
    const outcome = await runPaired({
      target,
      study: plan.study,
      plan: plan.experiments,
      items,
      caps: { ...opts.caps, runDeadlineMs: Math.max(1000, Math.min(opts.caps.runDeadlineMs, remaining() - INTERPRET_RESERVE_MS)) },
      signal: opts.signal,
      now,
      onProgress: (progress) => emit({ type: "progress", progress, usage: structuredClone(usage) }),
    });
    if (outcome.experiments.every((e) => e.pairs.length === 0)) {
      throw new LiveError("no-pairs", "No pair was scored in both arms, so there is nothing to analyse.");
    }
    const ran = now();
    leave("run");

    enter("analyze");
    const inv = buildInvestigation({ id: opts.id, plan, outcome, items, models: opts.models, startedAt, times: { planned, ran } });
    const analysis = analyze(inv, opts.models);
    leave("analyze");

    enter("interpret");
    const conclusion = await interpret({
      llm: reasoningInterpret,
      inv,
      plan,
      analysis,
      caps: { ...opts.caps, reasoningTimeoutMs: Math.max(5000, Math.min(opts.caps.reasoningTimeoutMs, Math.floor(remaining() / 2))) },
      signal: opts.signal,
      onAttempt: (attempt, ok, problems) => emit({ type: "interpret-attempt", attempt, ok, problems }),
    });
    const finished = now();
    const final = {
      ...inv,
      updatedAt: new Date(finished).toISOString(),
      events: [
        ...inv.events,
        {
          id: `${inv.id}/ev-conclusion`,
          kind: "conclusion" as const,
          at: new Date(finished).toISOString(),
          text: conclusion.text,
          refs: inv.hypotheses.map((h) => h.id),
          experimentId: null,
        },
      ],
    };
    leave("interpret");

    const result: LiveResult = {
      investigation: final,
      conclusion,
      plan,
      draftAttempts: attempts,
      run: {
        plannedCalls: outcome.calls.total,
        scored: outcome.calls.scored,
        failed: outcome.calls.failed,
        cancelled: outcome.calls.cancelled,
        deadlineHit: outcome.deadlineHit,
        durationMs: outcome.finishedAt - outcome.startedAt,
        perExperiment: outcome.experiments.map((e) => ({
          id: e.id,
          plannedPairs: e.plannedPairs,
          completedPairs: e.pairs.length,
          excludedPairs: e.excludedPairs,
        })),
      },
      usage: structuredClone(usage),
      models: opts.models,
      targetReported: outcome.model,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finished).toISOString(),
    };
    emit({ type: "result", result });
    return result;
  } catch (e) {
    const failure = describeFailure(e);
    emit({ type: "error", stage, ...failure });
    throw e;
  }
}

/** A failure in words for the page. Provider messages are already free of keys (see llm/http.ts). */
export function describeFailure(e: unknown): Pick<Extract<LiveEvent, { type: "error" }>, "code" | "kind" | "message"> {
  if (e instanceof LiveError) return { code: e.code, kind: null, message: e.message };
  if (e instanceof LLMError) return { code: e.kind === "aborted" ? "aborted" : "provider", kind: e.kind, message: e.message };
  return { code: "internal", kind: null, message: "Something went wrong inside the live engine." };
}
